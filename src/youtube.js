import fs from 'fs'
import YTDlpWrapModule from 'yt-dlp-wrap'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { ensureYtDlpBinary } from '../scripts/ensure-ytdlp.js'
const YTDlpWrap = YTDlpWrapModule.default || YTDlpWrapModule

let ytDlpInstance = null
let ytDlpPromise = null

async function getYtDlp() {
  if (ytDlpInstance) return ytDlpInstance
  if (!ytDlpPromise) {
    ytDlpPromise = (async () => {
      const binaryPath = await ensureYtDlpBinary()
      ytDlpInstance = new YTDlpWrap(binaryPath)
      return ytDlpInstance
    })()
  }
  return ytDlpPromise
}

// Proactively initialize on startup in background
getYtDlp().catch((err) => {
  console.error('[OffTrack] Background yt-dlp initialization error:', err)
})

const inFlightRequests = new Map();

export async function getStreamData(query) {
  if (inFlightRequests.has(query)) {
    return inFlightRequests.get(query);
  }

  const promise = (async () => {
    let rawQuery = query;
    let targetDurationMs = 0;
    if (query.includes('|DURATION:')) {
      const parts = query.split('|DURATION:');
      rawQuery = parts[0].trim();
      targetDurationMs = parseInt(parts[1], 10);
    }
    
    // Clean query of any trailing artifacts
    const cleanQuery = rawQuery.replace(/\|.*$/, '').trim();
    if (!cleanQuery) throw new Error('Search query cannot be empty');

    const dlp = await getYtDlp();

    // Check if direct YouTube URL or 11-char video ID
    const isDirectUrl = cleanQuery.includes('youtube.com/') || cleanQuery.includes('youtu.be/');
    const isVideoId = /^[a-zA-Z0-9_-]{11}$/.test(cleanQuery);

    if (isDirectUrl || isVideoId) {
      const targetUrl = isVideoId ? `https://www.youtube.com/watch?v=${cleanQuery}` : cleanQuery;
      console.log(`[YouTube] Direct stream resolution for: "${targetUrl}"`);
      const streamArgs = [
        targetUrl,
        '--print', '%(title)s|||%(url)s|||%(duration_string)s|||%(thumbnail)s|||%(duration)s',
        '--extractor-args', 'youtube:player_client=android',
        '-f', 'ba[ext=m4a]/140/bestaudio[ext=m4a]/251/bestaudio[ext=webm]/bestaudio/18/b',
        '--no-playlist',
        '--no-warnings',
        '--no-update',
      ];
      if (ffmpegInstaller && ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
        streamArgs.push('--ffmpeg-location', ffmpegInstaller.path);
      }
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Search timed out after 25s. Check your connection.')), 25000)
      );
      const streamOut = await Promise.race([dlp.execPromise(streamArgs), timeoutPromise]);
      const parts = streamOut.trim().split('|||');
      const title = parts[0] || 'Unknown';
      const streamUrl = parts[1] || '';
      const durationStr = parts[2] || '0:00';
      const thumbnail = parts[3] || '';
      const durationSeconds = parts[4] ? parseInt(parts[4], 10) : 0;
      if (!streamUrl) throw new Error('Could not resolve stream URL for this link');
      return { title, streamUrl, durationStr, durationSeconds, thumbnail };
    }

    console.log(`YouTube Search Query: "${cleanQuery}" (Target: ${targetDurationMs}ms)`);

    // Step 1: Fast metadata search (top 4 results without downloading stream formats)
    const metaArgs = [
      `ytsearch4:${cleanQuery}`,
      '--flat-playlist',
      '--print', '%(title)s|||%(id)s|||%(duration_string)s|||%(duration)s|||%(thumbnail)s',
      '--no-warnings',
      '--no-update',
    ];
    const timeoutMetaPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Search timed out after 15s. Check your connection.')), 15000)
    );
    const metaOutput = await Promise.race([dlp.execPromise(metaArgs), timeoutMetaPromise]);
    const lines = metaOutput.trim().split('\n').filter(l => l.includes('|||'));
    if (lines.length === 0) {
      throw new Error('No results found for this search');
    }

    const candidates = [];
    for (const line of lines) {
      const parts = line.trim().split('|||');
      if (parts.length >= 2) {
        const title = parts[0] || 'Unknown';
        const id = parts[1] || '';
        const durationStr = parts[2] || '0:00';
        const rawSec = parts[3] ? parseInt(parts[3], 10) : 0;
        const thumbnail = parts[4] || '';

        let durationSeconds = rawSec;
        if (!durationSeconds && durationStr) {
          const tparts = durationStr.split(':').map(Number);
          if (tparts.length === 3) durationSeconds = tparts[0] * 3600 + tparts[1] * 60 + tparts[2];
          else if (tparts.length === 2) durationSeconds = tparts[0] * 60 + tparts[1];
          else if (tparts.length === 1) durationSeconds = tparts[0];
        }

        // Filter out extreme long compilations / full albums (> 20 min)
        if (durationSeconds > 1200) continue;

        if (id) {
          candidates.push({ title, id, durationStr, durationSeconds, thumbnail });
        }
      }
    }

    if (candidates.length === 0) {
      throw new Error('No suitable stream found (all results were unavailable)');
    }

    const targetSec = targetDurationMs > 0 ? targetDurationMs / 1000 : 0;
    const qLower = cleanQuery.toLowerCase();

    // Score candidates: favor pure studio audio tracks over dialogue music videos
    function scoreCandidate(c) {
      let score = 100;
      const t = c.title.toLowerCase();

      // Highest preference: Official Audio or YouTube Music Topic tracks
      if (t.includes('official audio') || t.includes('(audio)') || t.includes('[audio]')) {
        score += 80;
      } else if (t.includes('- topic') || t.includes('topic')) {
        score += 75;
      } else if (t.includes('lyric video') || t.includes('(lyrics)') || t.includes('[lyrics]') || t.includes('lyrics')) {
        score += 60;
      } else if (t.includes('audio')) {
        score += 40;
      }

      // Strong penalty: Music Videos / Short Films with dialogues, movie scenes, skits
      if (t.includes('short film') || t.includes('movie scene') || t.includes('scene') || t.includes('trailer')) {
        score -= 100;
      } else if (t.includes('official music video') || t.includes('official video') || t.includes('music video')) {
        score -= 45;
      }

      // Unwanted formats
      if (t.includes('live') && !qLower.includes('live')) score -= 40;
      if (t.includes('remix') && !qLower.includes('remix')) score -= 30;
      if (t.includes('cover') && !qLower.includes('cover')) score -= 50;
      if (t.includes('instrumental') && !qLower.includes('instrumental') && !qLower.includes('karaoke')) score -= 50;

      // Target duration matching
      if (targetSec > 0 && c.durationSeconds > 0) {
        const diff = Math.abs(c.durationSeconds - targetSec);
        if (diff <= 3) score += 60;
        else if (diff <= 8) score += 35;
        else if (diff <= 15) score += 10;
        else if (diff > 30) score -= 60;
      }

      return score;
    }

    candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

    // Step 2: Extract audio stream URL for the top candidate (with fallback to 2nd if unavailable)
    let bestResult = null;
    for (let i = 0; i < Math.min(2, candidates.length); i++) {
      const chosen = candidates[i];
      try {
        const streamArgs = [
          `https://www.youtube.com/watch?v=${chosen.id}`,
          '--print', '%(title)s|||%(url)s|||%(duration_string)s|||%(thumbnail)s|||%(duration)s',
          '--extractor-args', 'youtube:player_client=android',
          '-f', 'ba[ext=m4a]/140/bestaudio[ext=m4a]/251/bestaudio[ext=webm]/bestaudio/18/b',
          '--no-playlist',
          '--no-warnings',
          '--no-update',
        ];
        if (ffmpegInstaller && ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
          streamArgs.push('--ffmpeg-location', ffmpegInstaller.path);
        }

        const timeoutStreamPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Stream extraction timed out')), 15000)
        );
        const streamOutput = await Promise.race([dlp.execPromise(streamArgs), timeoutStreamPromise]);
        const parts = streamOutput.trim().split('|||');
        if (parts.length >= 2 && parts[1]) {
          const rawSec = parts[4] ? parseInt(parts[4], 10) : chosen.durationSeconds;
          bestResult = {
            title: parts[0] || chosen.title,
            streamUrl: parts[1],
            durationStr: parts[2] || chosen.durationStr,
            durationSeconds: rawSec,
            thumbnail: parts[3] || chosen.thumbnail
          };
          console.log(`[YouTube] Selected clean audio track: "${bestResult.title}" (${bestResult.durationStr})`);
          break;
        }
      } catch (streamErr) {
        console.warn(`[YouTube] Failed candidate ${i} (${chosen.id}):`, streamErr.message);
      }
    }

    if (!bestResult || !bestResult.streamUrl) {
      throw new Error('No playable audio stream could be extracted');
    }

    return bestResult;
  })();

  inFlightRequests.set(query, promise);
  try {
    const result = await promise;
    setTimeout(() => inFlightRequests.delete(query), 10000);
    return result;
  } catch (err) {
    inFlightRequests.delete(query);
    throw err;
  }
}
