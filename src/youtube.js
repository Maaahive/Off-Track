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
    let cleanQuery = rawQuery.replace(/\|.*$/, '').trim();
    const qLower = cleanQuery.toLowerCase();
    const hasAudioKeyword = qLower.includes('audio') || qLower.includes('lyrics') || qLower.includes('lyric') || qLower.includes('topic');
    // Prioritize clean studio audio track so music videos with dialogues/skits aren't picked
    const ytQuery = hasAudioKeyword ? cleanQuery : `${cleanQuery} audio`;
    
    console.log(`YouTube Search Query: "${ytQuery}" (Target: ${targetDurationMs}ms)`)
    const dlp = await getYtDlp()
    const dlpArgs = [
      `ytsearch6:${ytQuery}`,
      '--print', '%(title)s|||%(url)s|||%(duration_string)s|||%(thumbnail)s|||%(duration)s',
      '--extractor-args', 'youtube:player_client=android',
      '-f', 'ba[ext=m4a]/140/bestaudio[ext=m4a]/251/bestaudio[ext=webm]/bestaudio/18/b',
      '--no-playlist',
      '--no-warnings',
      '--no-update',
    ]
    if (ffmpegInstaller && ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
      dlpArgs.push('--ffmpeg-location', ffmpegInstaller.path)
    }
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Search timed out after 20s. Check your connection.')), 20000)
    )
    const output = await Promise.race([dlp.execPromise(dlpArgs), timeoutPromise])
    const lines = output.trim().split('\n').filter(l => l.includes('|||'))
    if (lines.length === 0) {
      throw new Error('No results found for this search')
    }
    
    const results = [];
    for (const line of lines) {
      const parts = line.trim().split('|||');
      if (parts.length >= 2) {
        const title = parts[0] || 'Unknown';
        const streamUrl = parts[1] || '';
        const durationStr = parts[2] || '0:00';
        const thumbnail = parts[3] || '';
        const rawSec = parts[4] ? parseInt(parts[4], 10) : 0;

        let durationSeconds = rawSec;
        if (!durationSeconds) {
          const tparts = durationStr.split(':').map(Number);
          if (tparts.length === 3) durationSeconds = tparts[0]*3600 + tparts[1]*60 + tparts[2];
          else if (tparts.length === 2) durationSeconds = tparts[0]*60 + tparts[1];
          else if (tparts.length === 1) durationSeconds = tparts[0];
        }

        // Client-side filter: skip obvious compilations/podcasts (> 15 min)
        if (durationSeconds > 900) continue;
        
        if (streamUrl) {
          results.push({ title, streamUrl, durationStr, durationSeconds, thumbnail });
        }
      }
    }

    if (results.length === 0) {
      throw new Error('No suitable stream found (all results were unavailable)');
    }
    
    const targetSec = targetDurationMs > 0 ? targetDurationMs / 1000 : 0;

    // Score results: strongly favor pure studio audio tracks over music videos with dialogue
    function scoreResult(r) {
      let score = 100;
      const t = r.title.toLowerCase();

      // Highest preference: Official Audio or YouTube Music Topic tracks
      if (t.includes('official audio') || t.includes('(audio)') || t.includes('[audio]')) {
        score += 80;
      } else if (t.includes('- topic') || t.includes('topic')) {
        score += 75;
      } else if (t.includes('lyric video') || t.includes('(lyrics)') || t.includes('[lyrics]')) {
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
      if (targetSec > 0 && r.durationSeconds > 0) {
        const diff = Math.abs(r.durationSeconds - targetSec);
        if (diff <= 3) score += 60;
        else if (diff <= 8) score += 35;
        else if (diff <= 15) score += 10;
        else if (diff > 30) score -= 60;
      }

      return score;
    }

    results.sort((a, b) => scoreResult(b) - scoreResult(a));
    const bestResult = results[0];
    console.log(`[YouTube] Selected clean audio track: "${bestResult.title}" (${bestResult.durationStr})`);
    
    return { title: bestResult.title, streamUrl: bestResult.streamUrl, durationStr: bestResult.durationStr, durationSeconds: bestResult.durationSeconds, thumbnail: bestResult.thumbnail }

  })();

  inFlightRequests.set(query, promise);
  try {
    const result = await promise;
    // Keep it cached in memory for 10 seconds to protect against UI double-clicks or rapidly advancing queue
    setTimeout(() => inFlightRequests.delete(query), 10000);
    return result;
  } catch (err) {
    inFlightRequests.delete(query);
    throw err;
  }
}
