import YTDlpWrapModule from 'yt-dlp-wrap'
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
    let searchQuery = query;
    let targetDurationMs = 0;
    if (query.includes('|DURATION:')) {
      const parts = query.split('|DURATION:');
      searchQuery = parts[0].trim();
      targetDurationMs = parseInt(parts[1], 10);
    }
    
    console.log(`YouTube Search Query: ${searchQuery} (Target: ${targetDurationMs}ms)`)
    const dlp = await getYtDlp()
    const output = await dlp.execPromise([
      `ytsearch5:${searchQuery}`,
      '--get-title',
      '--get-url',
      '--get-duration',
      '--get-thumbnail',
      '--extractor-args', 'youtube:player_client=android',
      '-f', '140/251/ba/b',
      '--no-playlist',
      '--no-warnings',
      '--no-update',
      '--match-filter', 'duration < 600',
    ])
    const lines = output.trim().split('\n')
    if (lines.length < 4 || !lines[1]) {
      throw new Error('No stream found matching criteria')
    }
    
    const results = [];
    for (let i = 0; i < lines.length; i += 4) {
      if (lines[i] && lines[i+1]) {
        const title = lines[i];
        const streamUrl = lines[i+1];
        const durationStr = lines[i+2] || '0:00';
        const thumbnail = lines[i+3] || '';
        
        let durationSeconds = 0;
        const tparts = durationStr.split(':').map(Number);
        if (tparts.length === 3) durationSeconds = tparts[0]*3600 + tparts[1]*60 + tparts[2];
        else if (tparts.length === 2) durationSeconds = tparts[0]*60 + tparts[1];
        else if (tparts.length === 1) durationSeconds = tparts[0];
        
        results.push({ title, streamUrl, durationStr, durationSeconds, thumbnail });
      }
    }
    
    let bestResult = results[0];
    if (targetDurationMs > 0 && results.length > 1) {
      const targetSec = targetDurationMs / 1000;
      let minDiff = Infinity;
      for (const r of results) {
        const diff = Math.abs(r.durationSeconds - targetSec);
        if (diff < minDiff) {
          minDiff = diff;
          bestResult = r;
        }
      }
      console.log(`Matched closest stream: ${bestResult.title} (${bestResult.durationStr}) with target ${targetDurationMs}ms`);
    }
    
    return { title: bestResult.title, streamUrl: bestResult.streamUrl, durationStr: bestResult.durationStr, thumbnail: bestResult.thumbnail }
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
