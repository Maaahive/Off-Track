import { spawn, execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import electron from 'electron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// 1. Clean up any zombie or lingering electron processes on Windows
if (process.platform === 'win32') {
  try {
    execSync('taskkill /F /IM electron.exe /T 2>nul', { stdio: 'ignore' })
  } catch (_) {}

  // 2. Remove stale lock files from AppData
  const appData = process.env.APPDATA || ''
  if (appData) {
    const offtrackDir = path.join(appData, 'offtrack')
    if (fs.existsSync(offtrackDir)) {
      const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']
      for (const file of lockFiles) {
        const filePath = path.join(offtrackDir, file)
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
          }
        } catch (_) {}
      }
    }
  }
}

// 3. Launch Electron directly without shell wrapper
const child = spawn(electron, ['.'], {
  cwd: projectRoot,
  stdio: 'inherit'
})

child.on('exit', (code) => {
  process.exit(code || 0)
})
