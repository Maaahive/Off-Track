import { app, BrowserWindow, screen, ipcMain, globalShortcut, shell, Tray, nativeImage, Menu } from 'electron'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import spotifyUrlInfo from 'spotify-url-info'
import nodeFetch from 'node-fetch'
import SpotifyWebApi from 'spotify-web-api-node'
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.setName('OffTrack')

// Enforce single instance to prevent duplicate processes from corrupting/locking disk cache
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.reload()
  }
})

// Optimize Chromium audio streaming & smooth playback
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-gpu-process-crash-limit')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Ensure Windows Python / yt-dlp paths are included in process.env.PATH
function fixWindowsPath() {
  if (process.platform !== 'win32') return
  const userProfile = process.env.USERPROFILE || ''
  const extraPaths = [
    path.join(userProfile, 'AppData', 'Roaming', 'Python', 'Python313', 'Scripts'),
    path.join(userProfile, 'AppData', 'Roaming', 'Python', 'Python312', 'Scripts'),
    path.join(userProfile, 'AppData', 'Roaming', 'Python', 'Python311', 'Scripts'),
    path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Scripts'),
    path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts'),
    path.join(userProfile, 'scoop', 'shims'),
    'C:\\ProgramData\\chocolatey\\bin',
    path.join(__dirname, 'vendor', 'win'),
  ]
  for (const p of extraPaths) {
    if (fs.existsSync(p) && !process.env.PATH.includes(p)) {
      process.env.PATH = p + path.delimiter + process.env.PATH
    }
  }
}
fixWindowsPath()

const customFetch = (url, options = {}) => {
  options.headers = {
    ...options.headers,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
  return nodeFetch(url, options)
}

const { getTracks } = spotifyUrlInfo(customFetch)
import { isLoggedIn, getTokens, isTokenExpired, saveTokens, saveAppCredentials, getAppCredentials, hardReset, getSavedBackground, saveBackground } from './src/config.js'
import { getSpotifyClient, electronAuthCommand, cancelAuthCallback } from './src/auth.js'
import { getStreamData } from './src/youtube.js'

let mainWindow
let credsWindow = null
let gifWindow = null
let settingsWindow = null
let tray = null

// ─── Playlist Cache ──────────────────────────────────────────────────────────
let playlistCache = null
let playlistCacheTime = 0
const PLAYLIST_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 350,
    transparent: true,
    frame: false,
    resizable: true,
    minWidth: 400,
    minHeight: 250,
    alwaysOnTop: false,
    backgroundColor: '#00000000',
    title: 'OffTrack',
    icon: path.join(__dirname, 'assets', 'offtrack.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      backgroundThrottling: false, // Prevents background audio stuttering on Windows
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    app.isQuiting = true
    app.quit()
  })

  // ─── Screen Bounds Clamping (Prevents Window From Moving Off-Screen) ─────────
  function clampWindowToScreen() {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isMaximized() || mainWindow.isFullScreen()) return
    const bounds = mainWindow.getBounds()
    const display = screen.getDisplayMatching(bounds)
    if (!display) return

    const { workArea } = display
    let { x, y, width, height } = bounds
    let changed = false

    if (width > workArea.width) {
      width = workArea.width
      changed = true
    }
    if (height > workArea.height) {
      height = workArea.height
      changed = true
    }

    if (x < workArea.x) {
      x = workArea.x
      changed = true
    } else if (x + width > workArea.x + workArea.width) {
      x = workArea.x + workArea.width - width
      changed = true
    }

    if (y < workArea.y) {
      y = workArea.y
      changed = true
    } else if (y + height > workArea.y + workArea.height) {
      y = workArea.y + workArea.height - height
      changed = true
    }

    if (changed) {
      mainWindow.setBounds({ x, y, width, height })
    }
  }

  mainWindow.on('will-move', (event, newBounds) => {
    const display = screen.getDisplayMatching(newBounds)
    if (!display) return
    const { workArea } = display
    let { x, y, width, height } = newBounds
    let clamped = false

    if (x < workArea.x) {
      x = workArea.x
      clamped = true
    } else if (x + width > workArea.x + workArea.width) {
      x = workArea.x + workArea.width - width
      clamped = true
    }

    if (y < workArea.y) {
      y = workArea.y
      clamped = true
    } else if (y + height > workArea.y + workArea.height) {
      y = workArea.y + workArea.height - height
      clamped = true
    }

    if (clamped) {
      event.preventDefault()
      mainWindow.setBounds({ x, y, width, height })
    }
  })

  mainWindow.on('moved', clampWindowToScreen)
  mainWindow.on('resize', clampWindowToScreen)
  mainWindow.on('resized', clampWindowToScreen)

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'))
}

// ─── Queue & Playback State ──────────────────────────────────────────────────
let playQueue = []
let originalQueue = []
let playHistory = []
let isLooping = false
let isShuffling = false
let currentTrack = null
let currentPlayToken = 0
let preloadedNextTrack = null
let preloadToken = 0
let spotifyAutoAdvanceTimer = null
let hasAutoAdvancedSpotify = false

async function preloadNext() {
  if (spotifySyncActive) return
  if (playQueue.length === 0) return
  const nextQuery = playQueue[0]
  if (preloadedNextTrack && preloadedNextTrack.query === nextQuery) return
  const myToken = ++preloadToken
  try {
    const data = await getStreamData(nextQuery)
    if (myToken === preloadToken) {
      preloadedNextTrack = { query: nextQuery, data }
      console.log(`[Preload] Cached next track: ${data.title}`)
    }
  } catch(e) {
    console.warn('[Preload] Failed to preload next track:', e.message)
  }
}

function parseTrackMetadata(youtubeTitle, originalQuery) {
  let clean = (youtubeTitle || '')
    .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, ' ')
    .replace(/\b(official\s+video|official\s+audio|official\s+music\s+video|music\s+video|lyric\s+video|lyrics|visualizer|audio|4k|hd|remastered|full\s+song)\b/gi, ' ')
    .replace(/\|.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  let artist = 'YouTube'
  let title = clean

  if (clean.includes(' - ')) {
    const parts = clean.split(' - ')
    artist = parts[0].trim()
    title = parts.slice(1).join(' - ').trim()
  } else if (clean.includes(' – ')) {
    const parts = clean.split(' – ')
    artist = parts[0].trim()
    title = parts.slice(1).join(' – ').trim()
  } else if (clean.includes(': ')) {
    const parts = clean.split(': ')
    artist = parts[0].trim()
    title = parts.slice(1).join(': ').trim()
  }

  if (!title) title = clean || originalQuery || 'Unknown Track'
  if (!artist || artist.toLowerCase() === 'youtube') {
    artist = 'YouTube'
  }

  return { artist, title }
}

async function playTrack(query, startTimeSeconds = 0) {
  const token = ++currentPlayToken
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('track-loading', query)
  }

  try {
    let data
    if (preloadedNextTrack && preloadedNextTrack.query === query) {
      console.log(`[playTrack] Cache HIT for '${query}'!`)
      data = preloadedNextTrack.data
      preloadedNextTrack = null
    } else {
      console.log(`[playTrack] Fetching '${query}'...`)
      data = await getStreamData(query)
    }

    preloadNext()

    if (token !== currentPlayToken) {
      console.log(`[playTrack] Aborted '${query}' (newer track requested).`)
      return
    }

    if (!data.streamUrl) throw new Error('No stream found')

    let durationSeconds = 0
    if (data.durationStr) {
      const parts = data.durationStr.split(':').map(Number)
      if (parts.length === 3) durationSeconds = parts[0]*3600 + parts[1]*60 + parts[2]
      else if (parts.length === 2) durationSeconds = parts[0]*60 + parts[1]
      else if (parts.length === 1) durationSeconds = parts[0]
    }

    const meta = parseTrackMetadata(data.title, query)
    currentTrack = {
      title: meta.title,
      artist: meta.artist,
      durationSeconds,
      durationStr: data.durationStr,
      query,
      albumArt: data.thumbnail || '',
      rawTitle: data.title,
    }

    // Play stream using built-in HTML5 Audio in the Electron window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('native-audio-cmd-play', {
        streamUrl: data.streamUrl,
        startTime: startTimeSeconds
      })
      mainWindow.webContents.send('track-started', {
        ...currentTrack,
        initialProgressSeconds: startTimeSeconds
      })
    }
  } catch (err) {
    if (token !== currentPlayToken) return
    console.error('Playback error:', err)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('track-error', err.message)
    }
    setTimeout(handleNextSong, 2000)
  }
}

async function playOnSpotify(query) {
  const cleanQuery = (query || '').replace(/\|DURATION:\d+/gi, '').trim()
  console.log(`[SpotifySync] Searching and playing on Spotify: "${cleanQuery}"`)
  const spotify = await safeGetSpotifyClient()
  if (!spotify) {
    console.warn('[SpotifySync] Spotify client not available, falling back to YouTube')
    playTrack(query)
    return { success: true }
  }

  try {
    const searchRes = await spotify.searchTracks(cleanQuery, { limit: 5 })
    if (searchRes && searchRes.body && searchRes.body.tracks && searchRes.body.tracks.items.length > 0) {
      const item = searchRes.body.tracks.items[0]
      const devRes = await spotify.getMyDevices().catch(() => null)
      const devices = (devRes && devRes.body && devRes.body.devices) || []
      let targetDevice = devices.find(d => d.is_active) || devices[0]

      if (!targetDevice) {
        launchSpotifySilent()
        await new Promise(r => setTimeout(r, 1200))
        const retryDev = await spotify.getMyDevices().catch(() => null)
        const retryDevices = (retryDev && retryDev.body && retryDev.body.devices) || []
        targetDevice = retryDevices.find(d => d.is_active) || retryDevices[0]
      }

      const playOpts = { uris: [item.uri] }
      if (targetDevice) playOpts.device_id = targetDevice.id
      await spotify.play(playOpts)

      const durationSec = Math.floor((item.duration_ms || 0) / 1000)
      const mins = Math.floor(durationSec / 60)
      const secs = durationSec % 60
      const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`

      currentTrack = {
        title: item.name,
        artist: item.artists ? item.artists.map(a => a.name).join(', ') : 'Spotify',
        albumArt: item.album && item.album.images && item.album.images[0] ? item.album.images[0].url : '',
        durationSeconds: durationSec,
        durationStr,
        query,
        id: item.id,
        uri: item.uri,
        fromSpotify: true
      }

      lastSpotifyTrack = {
        ...currentTrack,
        progressSeconds: 0,
        progressMs: 0,
        isPlaying: true
      }
      lastSpotifyProgressSec = 0
      hasAutoAdvancedSpotify = false

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('native-audio-cmd-stop')
        mainWindow.webContents.send('spotify-sync-update', lastSpotifyTrack)
        mainWindow.webContents.send('track-started', {
          ...currentTrack,
          initialProgressSeconds: 0
        })
      }

      setTimeout(() => pollSpotifyPlayback(), 200)
      return { success: true, fromSpotify: true }
    } else {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('toast', `⚠️ "${cleanQuery}" not found on Spotify, trying YouTube...`)
      }
    }
  } catch (err) {
    console.warn('[SpotifySync] Search/play on Spotify error:', err.message)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toast', `⚠️ Spotify playback error, trying YouTube...`)
    }
  }

  playTrack(query)
  return { success: true }
}

function playSongUnified(query) {
  if (spotifySyncActive) {
    return playOnSpotify(query)
  } else {
    return playTrack(query)
  }
}

function handleNextSong() {
  console.log(`[handleNextSong] Queue remaining: ${playQueue.length}, looping: ${isLooping}, spotifySync: ${spotifySyncActive}`)
  if (spotifyAutoAdvanceTimer) {
    clearTimeout(spotifyAutoAdvanceTimer)
    spotifyAutoAdvanceTimer = null
  }
  hasAutoAdvancedSpotify = false

  if (isLooping && currentTrack) {
    // Replay current track
    playSongUnified(currentTrack.query)
    return
  }
  if (currentTrack) playHistory.push(currentTrack.query)
  if (playQueue.length > 0) {
    const nextQuery = playQueue.shift()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('queue-updated', playQueue)
    }
    playSongUnified(nextQuery)
  } else {
    currentTrack = null
    console.log('[handleNextSong] Queue empty, playback finished.')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('playback-stopped')
      mainWindow.webContents.send('queue-updated', playQueue)
    }
  }
}

function handlePrevSong() {
  if (spotifyAutoAdvanceTimer) {
    clearTimeout(spotifyAutoAdvanceTimer)
    spotifyAutoAdvanceTimer = null
  }
  hasAutoAdvancedSpotify = false

  if (playHistory.length > 0) {
    if (currentTrack) playQueue.unshift(currentTrack.query)
    const prevQuery = playHistory.pop()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('queue-updated', playQueue)
    }
    playSongUnified(prevQuery)
  } else if (currentTrack && !spotifySyncActive && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('native-audio-cmd-seek', 0)
  }
}

let currentPlaybackSeconds = 0
let isNativeAudioPlaying = false

// ─── Native Audio IPC Listeners ──────────────────────────────────────────────
ipcMain.on('native-audio-time', (_, time) => {
  currentPlaybackSeconds = time
  if (mainWindow && !mainWindow.isDestroyed() && currentTrack) {
    mainWindow.webContents.send('playback-time', time)
  }
})

ipcMain.on('native-audio-state', (_, isPaused) => {
  isNativeAudioPlaying = !isPaused
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('playback-state-update', isPaused)
  }
})

ipcMain.on('native-audio-ended', () => {
  isNativeAudioPlaying = false
  if (!isLooping && playQueue.length === 0) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('playback-stopped')
    }
  }
  if (!app.isQuiting) {
    handleNextSong()
  }
})

ipcMain.on('native-audio-error', (_, err) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('track-error', err)
  }
  setTimeout(handleNextSong, 2000)

})

// ─── App Lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const trayIconPath = path.join(__dirname, 'assets', 'trayTemplate.png')
  if (fs.existsSync(trayIconPath)) {
    try {
      tray = new Tray(nativeImage.createFromPath(trayIconPath))
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Show OffTrack', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } else { createWindow() } } },
        { label: 'Hide OffTrack', click: () => { if (mainWindow) mainWindow.hide() } },
        { type: 'separator' },
        { label: 'Play / Pause', click: () => { if (mainWindow) mainWindow.webContents.send('native-audio-cmd-toggle-pause') } },
        { type: 'separator' },
        { label: 'Quit', click: async () => {
          app.isQuiting = true
          await pauseSpotifyIfActive()
          app.quit()
        } },
      ])
      tray.setToolTip('MixTake')
      tray.setContextMenu(contextMenu)
    } catch (_) {}
  }

  createWindow()

  // Global shortcut support
  let currentGlobalShortcut = null
  ipcMain.handle('update-global-shortcut', (event, newShortcut) => {
    if (currentGlobalShortcut) globalShortcut.unregister(currentGlobalShortcut)
    currentGlobalShortcut = newShortcut
    if (newShortcut) {
      try {
        globalShortcut.register(newShortcut, () => {
          if (mainWindow) {
            if (mainWindow.isVisible() && mainWindow.isFocused()) {
              mainWindow.minimize()
            } else {
              mainWindow.show()
              mainWindow.focus()
            }
          } else {
            createWindow()
          }
        })
      } catch (_) {}
    }
  })

  ipcMain.handle('register-global-shortcuts', (event, shortcuts) => {
    globalShortcut.unregisterAll()
    const normalizeShortcut = (s) => {
      if (!s) return null
      return s
        .replace(/\bArrowRight\b/g, 'Right')
        .replace(/\bArrowLeft\b/g, 'Left')
        .replace(/\bArrowUp\b/g, 'Up')
        .replace(/\bArrowDown\b/g, 'Down')
        .replace(/\+\s$/, '+Space')
        .replace(/\+Spacebar$/, '+Space')
    }

    const normToggle = normalizeShortcut(shortcuts.globalToggle)
    if (normToggle) {
      try {
        globalShortcut.register(normToggle, () => {
          if (mainWindow) {
            if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.minimize()
            else { mainWindow.show(); mainWindow.focus() }
          } else createWindow()
        })
      } catch (_) {}
    }

    const mapAction = (key, actionName) => {
      const norm = normalizeShortcut(shortcuts[key])
      if (norm) {
        try {
          globalShortcut.register(norm, () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              if (['search', 'settings', 'gifPicker'].includes(actionName)) {
                mainWindow.show()
                mainWindow.focus()
              }
              mainWindow.webContents.send('global-action', actionName)
            }
          })
        } catch (_) {}
      }
    }

    mapAction('playPause', 'playPause')
    mapAction('nextSong', 'nextSong')
    mapAction('prevSong', 'prevSong')
    mapAction('loop', 'loop')
    mapAction('shuffle', 'shuffle')
    mapAction('search', 'search')
    mapAction('transparency', 'transparency')
    mapAction('sync', 'sync')
    mapAction('settings', 'settings')
  })

  app.on('activate', () => {
    if (mainWindow) mainWindow.show()
    else createWindow()
  })
})

async function pauseSpotifyIfActive() {
  if (spotifySyncActive) {
    try {
      const spotify = await safeGetSpotifyClient()
      if (spotify) {
        await Promise.race([
          spotify.pause().catch(() => {}),
          new Promise(resolve => setTimeout(resolve, 800))
        ])
      }
    } catch (_) {}
  }
}

app.on('before-quit', async () => {
  app.isQuiting = true
  if (spotifySyncTimer) {
    clearTimeout(spotifySyncTimer)
    spotifySyncTimer = null
  }
  await pauseSpotifyIfActive()
  if (tray) {
    try { tray.destroy() } catch (_) {}
    tray = null
  }
})

app.on('window-all-closed', async () => {
  app.isQuiting = true
  await pauseSpotifyIfActive()
  if (tray) {
    try { tray.destroy() } catch (_) {}
    tray = null
  }
  app.quit()
  process.exit(0)
})

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('close-app', async () => {
  app.isQuiting = true
  if (spotifySyncTimer) {
    clearTimeout(spotifySyncTimer)
    spotifySyncTimer = null
  }
  await pauseSpotifyIfActive()
  if (tray) {
    try { tray.destroy() } catch (_) {}
    tray = null
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy()
  }
  app.quit()
  process.exit(0)
})

ipcMain.handle('minimize-app', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.handle('toggle-always-on-top', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  const newState = !mainWindow.isAlwaysOnTop()
  mainWindow.setAlwaysOnTop(newState, 'screen-saver')
  return newState
})

ipcMain.handle('get-always-on-top', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return true
  return mainWindow.isAlwaysOnTop()
})

ipcMain.handle('open-external', (event, url) => {
  if (url) shell.openExternal(url)
})

// In-app credentials modal
ipcMain.handle('open-credentials-window', () => {
  if (credsWindow) { credsWindow.focus(); return }
  credsWindow = new BrowserWindow({
    width: 400,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    title: 'Spotify Credentials',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })
  credsWindow.loadFile(path.join(__dirname, 'ui', 'credentials.html'))
  credsWindow.on('closed', () => { credsWindow = null })
})

ipcMain.handle('save-spotify-creds', async (event, id, secret, redirectUri) => {
  saveAppCredentials({ clientId: id, clientSecret: secret, redirectUri })
  if (credsWindow) credsWindow.close()
  cancelAuthCallback()
  try {
    let authWin = null
    const result = await electronAuthCommand(async (authUrl) => {
      authWin = new BrowserWindow({
        width: 540,
        height: 750,
        title: 'Connect Spotify (OffTrack)',
        alwaysOnTop: true,
        autoHideMenuBar: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        }
      })
      authWin.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
      
      const menu = Menu.buildFromTemplate([
        {
          label: '🌐 Open in System Browser',
          click: () => {
            shell.openExternal(authUrl)
          }
        },
        {
          label: '🔄 Reload',
          click: () => {
            authWin.loadURL(authUrl)
          }
        }
      ])
      authWin.setMenu(menu)

      authWin.loadURL(authUrl)
      authWin.webContents.on('did-navigate', (_, url) => {
        console.log('[SpotifyAuth] In-App Navigated to:', url)
        if (url.includes(':8888/callback')) {
          setTimeout(() => {
            if (authWin && !authWin.isDestroyed()) authWin.close()
          }, 1500)
        }
      })
      authWin.webContents.on('did-fail-load', (_, code, desc, url) => {
        console.log('[SpotifyAuth] Failed to load:', desc, url)
      })
    })
    if (credsWindow && !credsWindow.isDestroyed()) credsWindow.close()
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload()
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.reload()
    return { success: true, user: result.user }
  } catch (err) {
    console.warn('In-app auth failed:', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('save-and-auth-browser', async (event, id, secret, redirectUri) => {
  saveAppCredentials({ clientId: id, clientSecret: secret, redirectUri })
  cancelAuthCallback()
  try {
    const result = await electronAuthCommand(async (authUrl) => {
      shell.openExternal(authUrl)
    })
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload()
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.reload()
    return { success: true, user: result.user }
  } catch (err) {
    console.warn('Browser auth failed:', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('exchange-spotify-code', async (event, codeOrUrl) => {
  try {
    let code = (codeOrUrl || '').trim()
    if (code.includes('code=')) {
      const match = code.match(/code=([^&]+)/)
      if (match) code = decodeURIComponent(match[1])
    }
    if (!code) throw new Error('No valid authorization code found in input.')
    const spotify = createSpotifyClient()
    const data = await spotify.authorizationCodeGrant(code)
    const { access_token, refresh_token, expires_in } = data.body
    saveTokens({
      accessToken:  access_token,
      refreshToken: refresh_token,
      expiresIn:    expires_in,
    })
    spotify.setAccessToken(access_token)
    const me = await spotify.getMe()
    saveUserInfo({ id: me.body.id, displayName: me.body.display_name })
    if (credsWindow && !credsWindow.isDestroyed()) credsWindow.close()
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload()
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.reload()
    return { success: true, user: me.body.display_name }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-spotify-creds', () => getAppCredentials())
ipcMain.handle('close-credentials-window', () => {
  if (credsWindow) credsWindow.close()
})

ipcMain.handle('is-logged-in', () => isLoggedIn())
ipcMain.handle('logout-spotify', async () => {
  try {
    const spotify = await safeGetSpotifyClient()
    if (spotify) {
      await spotify.pause().catch(() => {})
    }
  } catch (_) {}

  spotifySyncActive = false
  if (spotifySyncTimer) {
    clearTimeout(spotifySyncTimer)
    spotifySyncTimer = null
  }

  hardReset()
  playlistCache = null
  playlistCacheTime = 0

  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload()
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.reload()
})

let currentBackground = getSavedBackground() || 'backgrounds/wallpaper.jpg'
ipcMain.on('change-background', (event, bgUrl) => {
  currentBackground = bgUrl
  saveBackground(bgUrl)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('background-changed', bgUrl)
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('background-changed', bgUrl)
  }
})
ipcMain.handle('get-current-background', () => getSavedBackground() || currentBackground)
ipcMain.handle('get-saved-background', () => getSavedBackground() || currentBackground)
ipcMain.handle('save-background', (event, bgUrl) => {
  currentBackground = bgUrl
  saveBackground(bgUrl)
  return true
})

// Custom themes
ipcMain.handle('save-custom-theme', (event, theme) => {
  const themesPath = path.join(app.getPath('userData'), 'user-themes.json')
  let themes = []
  if (fs.existsSync(themesPath)) {
    try { themes = JSON.parse(fs.readFileSync(themesPath, 'utf8')) } catch (_) {}
  }
  themes.push(theme)
  fs.writeFileSync(themesPath, JSON.stringify(themes))
  return true
})

ipcMain.handle('delete-custom-theme', (event, themeName) => {
  const themesPath = path.join(app.getPath('userData'), 'user-themes.json')
  let themes = []
  if (fs.existsSync(themesPath)) {
    try { themes = JSON.parse(fs.readFileSync(themesPath, 'utf8')) } catch (_) {}
  }
  themes = themes.filter(t => t.name !== themeName)
  fs.writeFileSync(themesPath, JSON.stringify(themes))
  return true
})

ipcMain.handle('load-custom-themes', () => {
  const themesPath = path.join(app.getPath('userData'), 'user-themes.json')
  if (fs.existsSync(themesPath)) {
    try { return JSON.parse(fs.readFileSync(themesPath, 'utf8')) } catch (_) {}
  }
  return []
})

// GIF Picker
ipcMain.handle('open-gif-window', () => {
  if (gifWindow) { gifWindow.focus(); return }
  gifWindow = new BrowserWindow({
    width: 440,
    height: 480,
    frame: false,
    transparent: true,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })
  gifWindow.loadFile(path.join(__dirname, 'ui', 'gif-picker.html'))
  gifWindow.on('closed', () => { gifWindow = null })
})

ipcMain.handle('select-gif', (event, url, name) => {
  if (mainWindow) {
    mainWindow.webContents.send('gif-selected', { url, name })
  }
})

// Settings window
ipcMain.handle('open-settings', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 900,
    height: 700,
    frame: false,
    transparent: true,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })
  settingsWindow.loadFile(path.join(__dirname, 'ui', 'settings.html'))
  settingsWindow.on('closed', () => { settingsWindow = null })
})

ipcMain.handle('close-settings', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close()
})

ipcMain.handle('sync-settings', (event, settings) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings-synced', settings)
  }
})

// Spotify integration
async function safeGetSpotifyClient() {
  if (!isLoggedIn()) return null
  const spotify = getSpotifyClient()
  const { accessToken, refreshToken } = getTokens()
  spotify.setAccessToken(accessToken)
  spotify.setRefreshToken(refreshToken)

  if (isTokenExpired()) {
    try {
      const data = await spotify.refreshAccessToken()
      spotify.setAccessToken(data.body.access_token)
      saveTokens({
        accessToken: data.body.access_token,
        refreshToken: data.body.refresh_token || refreshToken,
        expiresIn: data.body.expires_in,
      })
    } catch (_) {
      return null
    }
  }
  return spotify
}

ipcMain.handle('get-playlists', async () => {
  if (!isLoggedIn()) return { status: 'not_connected' }
  const now = Date.now()
  const cacheValid = playlistCache && (now - playlistCacheTime) < PLAYLIST_CACHE_TTL

  async function fetchFresh() {
    const spotify = await safeGetSpotifyClient()
    if (!spotify) return { status: 'not_connected' }
    try {
      const data = await spotify.getUserPlaylists({ limit: 50 })
      const playlists = [
        { id: 'liked_songs', name: '❤️ Liked Songs' },
        ...data.body.items.map(p => ({ id: p.id, name: p.name }))
      ]
      const result = { status: 'success', playlists }
      playlistCache = result
      playlistCacheTime = Date.now()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('playlists-updated', result)
      }
      return result
    } catch (err) {
      return { status: 'error', message: err.message }
    }
  }

  if (cacheValid) {
    fetchFresh().catch(console.error)
    return playlistCache
  }
  return await fetchFresh()
})

ipcMain.handle('get-playlist-tracks', async (event, playlistId) => {
  const spotify = await safeGetSpotifyClient()
  if (!spotify) return { status: 'error', message: 'Not connected' }
  const token = spotify.getAccessToken()
  const tracks = []
  let offset = 0
  const limit = playlistId === 'liked_songs' ? 50 : 100

  try {
    while (true) {
      const url = playlistId === 'liked_songs'
        ? `https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`
        : `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()

      if (data.error) {
        if (data.error.status === 403) {
          try {
            const publicUrl = `https://open.spotify.com/playlist/${playlistId}`
            const rawTracks = await getTracks(publicUrl)
            if (rawTracks && rawTracks.length > 0) {
              const mapped = rawTracks.map(t => ({
                name: t.name,
                artist: t.artists ? t.artists.map(a => a.name).join(', ') : (t.artist || 'Unknown'),
                duration_ms: t.duration || t.duration_ms || 0
              }))
              return { status: 'success', tracks: mapped }
            }
          } catch (_) {}
        }
        return { status: 'error', message: data.error.message }
      }

      const items = data.items
      if (!items || items.length === 0) break

      items.forEach(obj => {
        const trackObj = obj.track || obj.item
        if (trackObj && !trackObj.is_local && trackObj.name) {
          tracks.push({
            name: trackObj.name,
            artist: trackObj.artists?.[0]?.name ?? 'Unknown',
            album: trackObj.album?.name ?? '',
            duration_ms: trackObj.duration_ms || 0
          })
        }
      })

      if (items.length < limit || tracks.length >= (data.total || 0)) break
      offset += limit
    }
    return { status: 'success', tracks }
  } catch (err) {
    return { status: 'error', message: err.message }
  }
})

ipcMain.handle('fetch-playlist-url', async (event, url) => {
  try {
    let targetUrl = (url || '').trim()
    
    // Resolve shortened links (e.g. spotify.link)
    if (targetUrl.includes('spotify.link') || targetUrl.includes('spoti.fi')) {
      try {
        const headRes = await nodeFetch(targetUrl, { redirect: 'follow' })
        targetUrl = headRes.url || targetUrl
      } catch (_) {}
    }

    const match = targetUrl.match(/(?:playlist|blend)[\/:]([a-zA-Z0-9]+)/i)
    if (!match) throw new Error('Invalid Spotify Playlist or Blend URL')
    const playlistId = match[1]

    const creds = getAppCredentials()
    const clientId = creds.clientId || process.env.SPOTIFY_CLIENT_ID
    const clientSecret = creds.clientSecret || process.env.SPOTIFY_CLIENT_SECRET

    let spotify = await safeGetSpotifyClient()

    if (!spotify && clientId && clientSecret) {
      try {
        spotify = new SpotifyWebApi({ clientId, clientSecret })
        const grant = await spotify.clientCredentialsGrant()
        spotify.setAccessToken(grant.body['access_token'])
      } catch (_) {
        spotify = null
      }
    }

    if (spotify) {
      try {
        let tracks = []
        let offset = 0
        const limit = 100
        let total = 100

        const plInfo = await spotify.getPlaylist(playlistId)
        const playlistName = plInfo.body.name || 'Spotify Blend / Playlist'

        while (offset < total) {
          const res = await spotify.getPlaylistTracks(playlistId, { offset, limit })
          total = res.body.total || res.body.items?.length || 0
          const chunk = (res.body.items || [])
            .filter(item => item && item.track)
            .map(item => ({
              name: item.track.name,
              artist: item.track.artists?.map(a => a.name).join(', ') || item.track.artists?.[0]?.name || 'Unknown',
              album: item.track.album?.name || '',
              albumArt: item.track.album?.images?.[0]?.url || '',
              duration_ms: item.track.duration_ms || 0
            }))
          tracks = tracks.concat(chunk)
          offset += limit
          if (chunk.length === 0) break
        }
        return { status: 'success', tracks, playlistName }
      } catch (apiErr) {
        console.warn('[SpotifyAPI] getPlaylist failed:', apiErr.message)
      }
    }

    // Zero-login scraper fallback
    const spotifyUrlInfoAPI = spotifyUrlInfo(nodeFetch)
    const rawData = await spotifyUrlInfoAPI.getData(targetUrl).catch(() => null)
    const playlistName = rawData?.name || rawData?.title || 'Saved Playlist'
    const rawTracks = await spotifyUrlInfoAPI.getTracks(targetUrl)

    const tracks = rawTracks.map(t => ({
      name: t.name,
      artist: t.artists ? t.artists.map(a => a.name).join(', ') : (t.artists?.[0]?.name || t.artist || 'Unknown'),
      album: t.album?.name || '',
      duration_ms: t.duration || t.duration_ms || t.durationMs || 0
    }))

    return { status: 'success', tracks, playlistName }
  } catch (err) {
    let msg = err.message
    if (msg.includes("Couldn't find any data")) {
      msg = 'Spotify playlist is private, Blend, or unavailable. Please connect your Spotify in Settings.'
    }
    return { status: 'error', message: msg }
  }
})

// ─── Playback Controls IPC ───────────────────────────────────────────────────

ipcMain.handle('search-song', async (event, query) => {
  if (spotifyAutoAdvanceTimer) {
    clearTimeout(spotifyAutoAdvanceTimer)
    spotifyAutoAdvanceTimer = null
  }
  hasAutoAdvancedSpotify = false

  if (currentTrack && (!playHistory.length || playHistory[playHistory.length - 1] !== currentTrack.query)) {
    playHistory.push(currentTrack.query)
  }

  if (spotifySyncActive) {
    return await playOnSpotify(query)
  }

  playTrack(query)
  return { success: true }
})

ipcMain.handle('add-queue', (event, query) => {
  playQueue.push(query)
  preloadNext()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('queue-updated', playQueue)
  }
  return playQueue
})

ipcMain.handle('get-queue', () => playQueue)

ipcMain.handle('clear-queue', () => {
  playQueue = []
  preloadedNextTrack = null
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('queue-updated', playQueue)
  }
  return playQueue
})

ipcMain.handle('reorder-queue', (e, oldIndex, newIndex) => {
  if (oldIndex >= 0 && oldIndex < playQueue.length && newIndex >= 0 && newIndex < playQueue.length) {
    const [item] = playQueue.splice(oldIndex, 1)
    playQueue.splice(newIndex, 0, item)
    preloadNext()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('queue-updated', playQueue)
    }
  }
  return playQueue
})

ipcMain.handle('splice-queue', (e, start, deleteCount) => {
  playQueue.splice(start, deleteCount)
  preloadNext()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('queue-updated', playQueue)
  }
  return playQueue
})

ipcMain.handle('set-queue', (event, newQueue) => {
  playQueue = Array.isArray(newQueue) ? newQueue : []
  if (isShuffling) {
    originalQueue = [...playQueue]
    for (let i = playQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playQueue[i], playQueue[j]] = [playQueue[j], playQueue[i]];
    }
  }
  preloadNext()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('queue-updated', playQueue)
  }
  return playQueue
})

ipcMain.handle('next-song', async () => {
  if (spotifyAutoAdvanceTimer) {
    clearTimeout(spotifyAutoAdvanceTimer)
    spotifyAutoAdvanceTimer = null
  }
  if (spotifySyncActive) {
    if (playQueue.length > 0 || isLooping) {
      handleNextSong()
      return
    }
    const spotify = await safeGetSpotifyClient()
    if (spotify) {
      try { await spotify.skipToNext() } catch (e) {}
      setTimeout(pollSpotifyPlayback, 400)
      return
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('native-audio-cmd-stop')
  }
  handleNextSong()
})

ipcMain.handle('prev-song', async () => {
  if (spotifyAutoAdvanceTimer) {
    clearTimeout(spotifyAutoAdvanceTimer)
    spotifyAutoAdvanceTimer = null
  }
  if (spotifySyncActive) {
    if (playHistory.length > 0) {
      handlePrevSong()
      return
    }
    const spotify = await safeGetSpotifyClient()
    if (spotify) {
      try { await spotify.skipToPrevious() } catch (e) {}
      setTimeout(pollSpotifyPlayback, 400)
      return
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('native-audio-cmd-stop')
  }
  handlePrevSong()
})

ipcMain.handle('toggle-loop', () => {
  isLooping = !isLooping
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('native-audio-cmd-loop', isLooping)
    mainWindow.webContents.send('loop-toggled', isLooping)
  }
  return isLooping
})

ipcMain.handle('toggle-shuffle', () => {
  isShuffling = !isShuffling
  if (isShuffling) {
    originalQueue = [...playQueue]
    for (let i = playQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playQueue[i], playQueue[j]] = [playQueue[j], playQueue[i]];
    }
  } else {
    const newlyAdded = playQueue.filter(track => !originalQueue.includes(track))
    playQueue = [...originalQueue.filter(track => playQueue.includes(track)), ...newlyAdded]
  }
  preloadNext()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shuffle-toggled', isShuffling)
    mainWindow.webContents.send('queue-updated', playQueue)
  }
  return isShuffling
})

ipcMain.handle('toggle-play', async () => {
  if (spotifySyncActive) {
    const spotify = await safeGetSpotifyClient()
    if (spotify) {
      try {
        const state = await spotify.getMyCurrentPlaybackState()
        if (state && state.body && state.body.is_playing) {
          await spotify.pause()
        } else {
          try {
            await spotify.play()
          } catch (playErr) {
            if (playQueue.length > 0) {
              handleNextSong()
              return
            }
          }
        }
        setTimeout(pollSpotifyPlayback, 400)
      } catch (e) {}
      return
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('native-audio-cmd-toggle-pause')
  }
})

async function seekSpotify(seconds) {
  if (spotifyAutoAdvanceTimer) {
    clearTimeout(spotifyAutoAdvanceTimer)
    spotifyAutoAdvanceTimer = null
  }
  hasAutoAdvancedSpotify = true
  setTimeout(() => { hasAutoAdvancedSpotify = false }, 3500)

  const posMs = Math.max(0, Math.floor(seconds * 1000))
  lastSpotifyProgressSec = Math.floor(seconds)
  if (lastSpotifyTrack) {
    lastSpotifyTrack.progressSeconds = Math.floor(seconds)
    lastSpotifyTrack.progressMs = posMs
  }

  const spotify = await safeGetSpotifyClient()
  if (!spotify) return

  try {
    const devRes = await spotify.getMyDevices().catch(() => null)
    const devices = (devRes && devRes.body && devRes.body.devices) || []
    const targetDevice = devices.find(d => d.is_active) || devices[0]
    const opts = targetDevice ? { device_id: targetDevice.id } : {}

    console.log(`[SpotifySync] Seeking to ${seconds}s (${posMs}ms) on ${targetDevice?.name || 'active device'}...`)
    await spotify.seek(posMs, opts)
    setTimeout(() => pollSpotifyPlayback(), 200)
  } catch (err) {
    console.warn('[SpotifyRemote] seek error:', err.message)
    // Fallback: If seek API is restricted (Spotify Free) or rejected, use play({ position_ms })
    try {
      const devRes = await spotify.getMyDevices().catch(() => null)
      const devices = (devRes && devRes.body && devRes.body.devices) || []
      const targetDevice = devices.find(d => d.is_active) || devices[0]
      if (targetDevice && currentTrack && currentTrack.uri) {
        console.log(`[SpotifySync] Seeking via play({ position_ms: ${posMs} })...`)
        await spotify.play({
          device_id: targetDevice.id,
          uris: [currentTrack.uri],
          position_ms: posMs
        })
        setTimeout(() => pollSpotifyPlayback(), 200)
        return
      }
    } catch (e2) {
      console.warn('[SpotifyRemote] play with position_ms fallback error:', e2.message)
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('spotify-seek-restricted', seconds)
    }
  }
}

ipcMain.handle('seek', async (event, seconds) => {
  if (spotifySyncActive) {
    await seekSpotify(seconds)
    return
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('native-audio-cmd-seek', seconds)
  }
})

// ─── Spotify Live Sync ───────────────────────────────────────────────────────
let spotifySyncActive = false
let spotifySyncTimer = null

let lastSpotifyProgressSec = 0
let lastSpotifyTrack = null
let isSpotifyPolling = false

function scheduleNextSpotifyPoll(ms) {
  if (spotifySyncTimer) clearTimeout(spotifySyncTimer)
  if (spotifySyncActive) {
    const delay = ms || (lastSpotifyTrack && lastSpotifyTrack.isPlaying ? 800 : 1800)
    spotifySyncTimer = setTimeout(pollSpotifyPlayback, delay)
  }
}

async function pollSpotifyPlayback() {
  if (!spotifySyncActive || !isLoggedIn() || isSpotifyPolling) return
  isSpotifyPolling = true
  try {
    const spotify = await safeGetSpotifyClient()
    if (!spotify) return

    const res = await spotify.getMyCurrentPlaybackState()
    if (res && res.body && res.body.item) {
      const item = res.body.item
      const isPlaying = res.body.is_playing
      const progressMs = res.body.progress_ms || 0
      const durationMs = item.duration_ms || 0
      const progressSec = Math.floor(progressMs / 1000)
      const durationSec = Math.floor(durationMs / 1000)

      // If track changed on Spotify (e.g. natural advance or user clicked track in Spotify app)
      if (lastSpotifyTrack && lastSpotifyTrack.id !== item.id) {
        const prevDuration = lastSpotifyTrack.durationSeconds || 0
        const prevProgress = lastSpotifyProgressSec || 0
        const prevReachedEnd = prevDuration > 0 && prevProgress >= (prevDuration - 3)

        if (prevReachedEnd && !hasAutoAdvancedSpotify && (playQueue.length > 0 || isLooping)) {
          console.log('[SpotifySync] Track finished naturally and Spotify moved track. Advancing OffTrack queue...')
          hasAutoAdvancedSpotify = true
          handleNextSong()
          return
        }

        hasAutoAdvancedSpotify = false
        if (spotifyAutoAdvanceTimer) {
          clearTimeout(spotifyAutoAdvanceTimer)
          spotifyAutoAdvanceTimer = null
        }
      }

      // Check if paused at track end
      // MUST ensure both current progress and previous progress are legitimately at the very end
      const isNaturallyAtEnd = durationSec > 0 && progressSec >= (durationSec - 2) && lastSpotifyProgressSec >= (durationSec - 3)
      if (!isPlaying && lastSpotifyTrack && lastSpotifyTrack.isPlaying && isNaturallyAtEnd && !hasAutoAdvancedSpotify) {
        if (playQueue.length > 0 || isLooping) {
          console.log('[SpotifySync] Track reached end and paused. Advancing queue...')
          hasAutoAdvancedSpotify = true
          handleNextSong()
          return
        }
      }

      // If playing and within 2.5s of end, schedule seamless advance
      const remainingMs = durationMs - progressMs
      if (isPlaying && remainingMs > 0 && remainingMs <= 2500 && !hasAutoAdvancedSpotify && (playQueue.length > 0 || isLooping)) {
        if (!spotifyAutoAdvanceTimer) {
          console.log(`[SpotifySync] Scheduling queue advance in ${remainingMs + 200}ms`)
          spotifyAutoAdvanceTimer = setTimeout(() => {
            spotifyAutoAdvanceTimer = null
            if (spotifySyncActive && !hasAutoAdvancedSpotify && (playQueue.length > 0 || isLooping)) {
              console.log('[SpotifySync] Auto-advance timer fired. Advancing queue...')
              hasAutoAdvancedSpotify = true
              handleNextSong()
            }
          }, remainingMs + 200)
        }
      } else if (!isPlaying && spotifyAutoAdvanceTimer) {
        clearTimeout(spotifyAutoAdvanceTimer)
        spotifyAutoAdvanceTimer = null
      }

      lastSpotifyProgressSec = progressSec

      const mins = Math.floor(durationSec / 60)
      const secs = durationSec % 60
      const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`

      const track = {
        id: item.id,
        title: item.name,
        artist: item.artists ? item.artists.map(a => a.name).join(', ') : 'Spotify',
        albumArt: item.album && item.album.images && item.album.images[0] ? item.album.images[0].url : '',
        durationSeconds: durationSec,
        durationStr,
        progressSeconds: progressSec,
        progressMs: progressMs,
        isPlaying,
        fromSpotify: true
      }
      lastSpotifyTrack = track

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('spotify-sync-update', track)
      }
    } else {
      if (lastSpotifyTrack && lastSpotifyTrack.isPlaying && !hasAutoAdvancedSpotify) {
        const prevDuration = lastSpotifyTrack.durationSeconds || 0
        const prevProgress = lastSpotifyProgressSec || 0
        if (prevDuration > 0 && prevProgress >= (prevDuration - 4)) {
          if (playQueue.length > 0 || isLooping) {
            console.log('[SpotifySync] Playback stopped at end of track. Advancing queue...')
            hasAutoAdvancedSpotify = true
            handleNextSong()
            return
          }
        }
      }
      lastSpotifyTrack = null
      lastSpotifyProgressSec = 0
    }
  } catch (_) {
  } finally {
    isSpotifyPolling = false
    scheduleNextSpotifyPoll()
  }
}

function launchSpotifySilent() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || ''
    const localAppData = process.env.LOCALAPPDATA || ''
    const possiblePaths = [
      path.join(appData, 'Spotify', 'Spotify.exe'),
      path.join(localAppData, 'Microsoft', 'WindowsApps', 'Spotify.exe'),
      path.join(localAppData, 'Spotify', 'Spotify.exe'),
      'C:\\Program Files\\Spotify\\Spotify.exe',
      'C:\\Program Files (x86)\\Spotify\\Spotify.exe'
    ]
    for (const exePath of possiblePaths) {
      if (fs.existsSync(exePath)) {
        try {
          const child = spawn(exePath, ['--minimized'], {
            detached: true,
            stdio: 'ignore'
          })
          child.unref()
          console.log(`[SpotifySync] Launched Spotify silently from ${exePath}`)
          return true
        } catch (e) {
          console.warn('[SpotifySync] Spawn error:', e.message)
        }
      }
    }
    // Desktop client not installed — open Spotify in user's default browser!
    console.log('[SpotifySync] Spotify desktop app not found. Opening Spotify in browser...')
    shell.openExternal('https://open.spotify.com')
    return false
  } else if (process.platform === 'darwin') {
    const macPaths = [
      '/Applications/Spotify.app',
      path.join(process.env.HOME || '', 'Applications/Spotify.app')
    ]
    for (const appPath of macPaths) {
      if (fs.existsSync(appPath)) {
        try {
          const child = spawn('open', ['-j', '-a', appPath], {
            detached: true,
            stdio: 'ignore'
          })
          child.unref()
          return true
        } catch (_) {}
      }
    }
    console.log('[SpotifySync] Spotify not found on macOS. Opening in browser...')
    shell.openExternal('https://open.spotify.com')
    return false
  } else {
    try {
      const child = spawn('spotify', ['--minimized'], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
      return true
    } catch (_) {
      shell.openExternal('https://open.spotify.com')
      return false
    }
  }
}

async function setSpotifySync(enabled) {
  if (enabled) {
    if (!isLoggedIn()) {
      return { success: false, reason: 'not_logged_in', message: 'Please connect Spotify in Settings first.' }
    }

    const spotify = await safeGetSpotifyClient()
    if (!spotify) {
      return { success: false, reason: 'no_client', message: 'Unable to connect to Spotify client.' }
    }

    // 1. Check for open Spotify devices (or launch silently in background)
    let targetDevice = null
    try {
      let devRes = await spotify.getMyDevices()
      let devices = (devRes && devRes.body && devRes.body.devices) || []
      targetDevice = devices.find(d => d.is_active) || devices[0]

      if (!targetDevice) {
        console.log('[SpotifySync] No open Spotify device detected. Checking Spotify...')
        const hasDesktop = launchSpotifySilent()

        if (hasDesktop) {
          // Poll for Spotify background process to connect to Spotify Connect network (up to 3.5s)
          for (let i = 0; i < 7; i++) {
            await new Promise(r => setTimeout(r, 500))
            try {
              devRes = await spotify.getMyDevices()
              devices = (devRes && devRes.body && devRes.body.devices) || []
              targetDevice = devices.find(d => d.is_active) || devices[0]
              if (targetDevice) {
                console.log(`[SpotifySync] Spotify background device ready: ${targetDevice.name} (${targetDevice.id})`)
                break
              }
            } catch (_) {}
          }
        }
      }

      if (!targetDevice) {
        shell.openExternal('https://open.spotify.com')
        return {
          success: false,
          reason: 'no_device',
          message: 'Spotify opened in your browser! Play any song, then click Sync.'
        }
      }
    } catch (err) {
      return { success: false, reason: 'device_check_failed', message: err.message }
    }

    // 2. Enable sync and pause local player
    spotifySyncActive = true
    if (spotifySyncTimer) {
      clearTimeout(spotifySyncTimer)
      spotifySyncTimer = null
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('native-audio-cmd-pause')
      mainWindow.webContents.send('spotify-sync-status-changed', true)
    }
    isNativeAudioPlaying = false

    scheduleNextSpotifyPoll()

    // 3. Replicate/handoff playback to Spotify with explicit device_id
    if (currentTrack) {
      try {
        let spotifyQuery = ''
        if (currentTrack.artist && currentTrack.artist.toLowerCase() !== 'youtube') {
          spotifyQuery = `${currentTrack.title} ${currentTrack.artist}`
        } else if (currentTrack.query) {
          spotifyQuery = currentTrack.query.replace(/\|DURATION:\d+/, '').trim()
        } else {
          spotifyQuery = currentTrack.title
        }

        console.log(`[SpotifySync] Searching Spotify for handoff: "${spotifyQuery}"`)
        const searchRes = await spotify.searchTracks(spotifyQuery, { limit: 5 })
        if (searchRes && searchRes.body && searchRes.body.tracks && searchRes.body.tracks.items.length > 0) {
          const item = searchRes.body.tracks.items[0]
          const positionMs = Math.floor(currentPlaybackSeconds * 1000)
          const artistNames = item.artists ? item.artists.map(a => a.name).join(', ') : 'Unknown'
          console.log(`[SpotifySync] Transferring playback to Spotify: "${item.name}" by ${artistNames} on ${targetDevice.name} at ${positionMs}ms`)
          
          await spotify.play({
            device_id: targetDevice.id,
            uris: [item.uri],
            position_ms: positionMs
          })
          pollSpotifyPlayback()
        } else {
          // Play current track on target device
          await spotify.play({ device_id: targetDevice.id })
          pollSpotifyPlayback()
        }
      } catch (err) {
        console.warn('[SpotifySync] Could not handoff song to Spotify:', err.message)
      }
    } else {
      try {
        await spotify.play({ device_id: targetDevice.id })
        pollSpotifyPlayback()
      } catch (_) {}
    }

    return { success: true, active: true }
  } else {
    // 1. Unsyncing: stop polling and pause Spotify
    spotifySyncActive = false
    if (spotifySyncTimer) {
      clearTimeout(spotifySyncTimer)
      spotifySyncTimer = null
    }
    if (spotifyAutoAdvanceTimer) {
      clearTimeout(spotifyAutoAdvanceTimer)
      spotifyAutoAdvanceTimer = null
    }
    hasAutoAdvancedSpotify = false

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('spotify-sync-status-changed', false)
    }

    // 2. Pause Spotify asynchronously in the background so it never blocks the UI
    if (isLoggedIn()) {
      (async () => {
        try {
          const spotify = await safeGetSpotifyClient()
          if (spotify) {
            console.log('[SpotifySync] Pausing Spotify playback in background on unsync...')
            const state = await spotify.getMyCurrentPlaybackState().catch(() => null)
            if (state && state.body && state.body.is_playing) {
              const opts = state.body.device?.id ? { device_id: state.body.device.id } : {}
              await spotify.pause(opts).catch(() => {})
            } else {
              await spotify.pause().catch(() => {})
            }
          }
        } catch (err) {
          console.warn('[SpotifySync] Could not pause Spotify on unsync:', err.message)
        }
      })()
    }

    // 3. Auto-search Spotify song on YouTube and resume at exact timestamp!
    const resumeSec = lastSpotifyProgressSec || currentPlaybackSeconds || 0
    if (lastSpotifyTrack && lastSpotifyTrack.title && lastSpotifyTrack.title.toLowerCase() !== 'spotify') {
      const cleanArtist = (lastSpotifyTrack.artist && lastSpotifyTrack.artist.toLowerCase() !== 'spotify')
        ? lastSpotifyTrack.artist
        : ''
      const ytQuery = cleanArtist ? `${lastSpotifyTrack.title} ${cleanArtist}` : lastSpotifyTrack.title
      console.log(`[SpotifySync] Unsync: Transferring Spotify track to YouTube: "${ytQuery}" at ${resumeSec}s`)
      playTrack(ytQuery, resumeSec)
    } else if (currentTrack) {
      let sec = resumeSec
      if (currentTrack.durationSeconds > 0) {
        sec = Math.min(sec, currentTrack.durationSeconds - 1)
      }
      console.log(`[SpotifySync] Resuming OffTrack playback at ${sec}s`)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('native-audio-cmd-resume', sec)
        isNativeAudioPlaying = true
        mainWindow.webContents.send('playback-state-update', false)
      }
    }

    return { success: true, active: false }
  }
}

ipcMain.handle('toggle-spotify-sync', async (event, enable) => {
  return await setSpotifySync(enable)
})

ipcMain.handle('get-spotify-sync-status', () => spotifySyncActive)

ipcMain.handle('spotify-remote-play-pause', async () => {
  const spotify = await safeGetSpotifyClient()
  if (!spotify) return
  try {
    const state = await spotify.getMyCurrentPlaybackState()
    if (state && state.body && state.body.is_playing) {
      await spotify.pause()
    } else {
      await spotify.play()
    }
  } catch (e) {
    console.warn('[SpotifyRemote] play/pause error:', e.message)
  }
})

ipcMain.handle('spotify-remote-next', async () => {
  if (spotifyAutoAdvanceTimer) {
    clearTimeout(spotifyAutoAdvanceTimer)
    spotifyAutoAdvanceTimer = null
  }
  if (playQueue.length > 0 || isLooping) {
    handleNextSong()
    return
  }
  const spotify = await safeGetSpotifyClient()
  if (!spotify) return
  try { await spotify.skipToNext() } catch (e) {}
})

ipcMain.handle('spotify-remote-prev', async () => {
  if (spotifyAutoAdvanceTimer) {
    clearTimeout(spotifyAutoAdvanceTimer)
    spotifyAutoAdvanceTimer = null
  }
  if (playHistory.length > 0) {
    handlePrevSong()
    return
  }
  const spotify = await safeGetSpotifyClient()
  if (!spotify) return
  try { await spotify.skipToPrevious() } catch (e) {}
})

ipcMain.handle('spotify-remote-seek', async (e, seconds) => {
  await seekSpotify(seconds)
})

// ─── Synced Lyrics Support (LRCLIB) ───────────────────────────────────────────
const lyricsCache = new Map()

async function fetchJsonWithTimeout(url, timeoutMs = 6000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'OffTrack-Music-Player/1.0',
        'Accept': 'application/json'
      }
    })
    return resp
  } finally {
    clearTimeout(timer)
  }
}

function cleanTrackName(str) {
  if (!str) return ''
  return str
    .replace(/\|DURATION:\d+/gi, '')
    .replace(/\(.*?(official|video|audio|remaster|explicit|lyrics|version|deluxe|bonus|edit).*?\)/gi, '')
    .replace(/\[.*?(official|video|audio|remaster|explicit|lyrics|version|deluxe|bonus|edit).*?\]/gi, '')
    .replace(/ft\.?|feat\.?/gi, '')
    .replace(/- (official|video|audio|remaster|explicit|lyrics|version|deluxe|bonus|edit).*/gi, '')
    .trim()
}

async function fetchLyrics(trackInfo) {
  if (!trackInfo) return { success: false, reason: 'no_track_info' }
  let rawTitle = trackInfo.title || ''
  let rawArtist = (trackInfo.artist && trackInfo.artist.toLowerCase() !== 'spotify' && trackInfo.artist.toLowerCase() !== 'youtube')
    ? trackInfo.artist
    : ''
  
  let cleanTitle = cleanTrackName(rawTitle)
  let cleanArtist = cleanTrackName(rawArtist)

  // If title contains " - " and artist is empty, split them (e.g. "Artist - Track Title")
  if (cleanTitle.includes(' - ') && !cleanArtist) {
    const parts = cleanTitle.split(' - ')
    cleanArtist = parts[0].trim()
    cleanTitle = parts.slice(1).join(' - ').trim()
  }

  const duration = typeof trackInfo.durationSeconds === 'number' ? Math.round(trackInfo.durationSeconds) : null
  const cacheKey = `${cleanTitle.toLowerCase()}__${cleanArtist.toLowerCase()}`
  if (lyricsCache.has(cacheKey)) {
    return { success: true, data: lyricsCache.get(cacheKey) }
  }

  console.log(`[Lyrics] Searching LRCLIB for: "${cleanTitle}" by "${cleanArtist}"`)

  try {
    // 1. Try exact match query
    const params = new URLSearchParams()
    if (cleanTitle) params.append('track_name', cleanTitle)
    if (cleanArtist) params.append('artist_name', cleanArtist)
    if (trackInfo.album) params.append('album_name', cleanTrackName(trackInfo.album))
    if (duration) params.append('duration', String(duration))

    let resp = await fetchJsonWithTimeout(`https://lrclib.net/api/get?${params.toString()}`, 5000)
    if (resp.ok) {
      const data = await resp.json()
      if (data && (data.syncedLyrics || data.plainLyrics)) {
        lyricsCache.set(cacheKey, data)
        return { success: true, data }
      }
    }

    // 2. Try with primary artist if multiple artists listed
    if (cleanArtist && (cleanArtist.includes(',') || cleanArtist.includes('&'))) {
      const firstArtist = cleanArtist.split(/[,&]/)[0].trim()
      const p2 = new URLSearchParams()
      p2.append('track_name', cleanTitle)
      p2.append('artist_name', firstArtist)
      let resp2 = await fetchJsonWithTimeout(`https://lrclib.net/api/get?${p2.toString()}`, 5000)
      if (resp2.ok) {
        const data = await resp2.json()
        if (data && (data.syncedLyrics || data.plainLyrics)) {
          lyricsCache.set(cacheKey, data)
          return { success: true, data }
        }
      }
    }

    // 3. Fallback to search query
    const searchQuery = `${cleanTitle} ${cleanArtist}`.trim()
    if (searchQuery) {
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`
      resp = await fetchJsonWithTimeout(searchUrl, 5000)
      if (resp.ok) {
        const list = await resp.json()
        if (Array.isArray(list) && list.length > 0) {
          const best = list.find(item => item.syncedLyrics) || list[0]
          lyricsCache.set(cacheKey, best)
          return { success: true, data: best }
        }
      }
    }

    // 4. Fallback search by title only
    if (cleanTitle) {
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`
      resp = await fetchJsonWithTimeout(searchUrl, 5000)
      if (resp.ok) {
        const list = await resp.json()
        if (Array.isArray(list) && list.length > 0) {
          const match = cleanArtist
            ? list.find(item => item.artistName && cleanArtist.toLowerCase().includes(item.artistName.toLowerCase()) && item.syncedLyrics)
            : null
          const best = match || list.find(item => item.syncedLyrics) || list[0]
          if (best && (best.syncedLyrics || best.plainLyrics)) {
            lyricsCache.set(cacheKey, best)
            return { success: true, data: best }
          }
        }
      }
    }

    return { success: false, reason: 'not_found' }
  } catch (err) {
    console.warn('[Lyrics] Fetch error:', err.message)
    return { success: false, reason: 'fetch_error', message: err.message }
  }
}

ipcMain.handle('get-lyrics', async (e, trackInfo) => {
  return await fetchLyrics(trackInfo)
})