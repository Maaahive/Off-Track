import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'
import { pipeline } from 'stream/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

export function findExistingBinary() {
  const isWin = process.platform === 'win32'
  const exeName = isWin ? 'yt-dlp.exe' : 'yt-dlp'

  // 1. Check vendor folder
  const vendorSubdir = isWin ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  const vendorPath = path.join(rootDir, 'vendor', vendorSubdir, exeName)
  if (fs.existsSync(vendorPath) && fs.statSync(vendorPath).size > 1000000) {
    return vendorPath
  }

  // 2. Check root directory
  const rootPath = path.join(rootDir, exeName)
  if (fs.existsSync(rootPath) && fs.statSync(rootPath).size > 1000000) {
    return rootPath
  }

  // 3. Check system PATH
  try {
    const testCmd = isWin ? 'where yt-dlp' : 'which yt-dlp'
    const out = execSync(testCmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim()
    if (out) {
      // Verify it actually executes
      execSync('yt-dlp --version', { stdio: ['pipe', 'pipe', 'ignore'] })
      return 'yt-dlp'
    }
  } catch (e) {
    // Not found in PATH
  }

  return null
}

export async function ensureYtDlpBinary() {
  const existing = findExistingBinary()
  if (existing) {
    return existing
  }

  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'
  const exeName = isWin ? 'yt-dlp.exe' : 'yt-dlp'
  const vendorSubdir = isWin ? 'win' : isMac ? 'mac' : 'linux'
  const targetDir = path.join(rootDir, 'vendor', vendorSubdir)
  const targetPath = path.join(targetDir, exeName)
  const tempPath = path.join(targetDir, `${exeName}.downloading`)

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  let downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  if (isMac) {
    downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
  } else if (!isWin) {
    downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
  }

  console.log(`[OffTrack] yt-dlp binary not found on system. Downloading from GitHub...`)
  console.log(`[OffTrack] Target: ${targetPath}`)

  try {
    const res = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    })
    if (!res.ok) {
      throw new Error(`Failed to download yt-dlp: HTTP ${res.status} ${res.statusText}`)
    }

    const fileStream = fs.createWriteStream(tempPath)
    await pipeline(res.body, fileStream)

    // Rename temp to target on completion
    if (fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath) } catch (_) {}
    }
    fs.renameSync(tempPath, targetPath)

    if (!isWin) {
      fs.chmodSync(targetPath, 0o755)
    }

    console.log(`[OffTrack] Successfully downloaded yt-dlp to ${targetPath}`)
    return targetPath
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath) } catch (_) {}
    }
    console.error(`[OffTrack] Failed to download yt-dlp automatically:`, err)
    throw err
  }
}

// Allow direct execution: node scripts/ensure-ytdlp.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureYtDlpBinary()
    .then((binary) => {
      console.log(`[OffTrack] Ready: using yt-dlp at "${binary}"`)
      process.exit(0)
    })
    .catch((err) => {
      console.error(`[OffTrack] Error ensuring yt-dlp:`, err.message)
      process.exit(1)
    })
}
