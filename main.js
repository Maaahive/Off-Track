import { app, BrowserWindow, ipcMain, globalShortcut, dialog, shell, Tray, nativeImage, Menu } from 'electron'
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

// Suppress Chromium GPU and disk cache locking errors on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-gpu-process-crash-limit')
app.commandLine.appendSwitch('disable-http-cache')
app.commandLine.appendSwitch('disk-cache-size', '1')
app.commandLine.appendSwitch('media-cache-size', '1')

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
import { isLoggedIn, getTokens, isTokenExpired, saveTokens, saveAppCredentials, getAppCredentials, hardReset } from './src/config.js'
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
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    title: 'OffTrack',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      backgroundThrottling: false, // Prevents background audio stuttering on Windows
    }
  })
  mainWindow.setAlwaysOnTop(true, 'screen-saver')

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault()
      mainWindow.hide()
    }
    return false
  })

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'))
}

// ─── Queue & Playback State ──────────────────────────────────────────────────
let playQueue = []
let originalQueue = []
let playHistory = []
let isLooping = false
let isShuffling = false
let currentTrack = null
let isManualStop = false
let currentPlayToken = 0
let preloadedNextTrack = null
let preloadToken = 0

async function preloadNext() {
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

async function playTrack(query) {
  if (spotifySyncActive) {
    console.log('[playTrack] Stopping active Spotify sync to play new OffTrack song')
    await setSpotifySync(false)
  }

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

    isManualStop = false

    // Play stream using built-in HTML5 Audio in the Electron window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('native-audio-cmd-play', { streamUrl: data.streamUrl })
      mainWindow.webContents.send('track-started', currentTrack)
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

function handleNextSong() {
  console.log(`[handleNextSong] Queue remaining: ${playQueue.length}`)
  if (currentTrack) playHistory.push(currentTrack.query)
  if (playQueue.length > 0) {
    const nextQuery = playQueue.shift()
    playTrack(nextQuery)
  } else {
    currentTrack = null
  }
}

function handlePrevSong() {
  if (playHistory.length > 0) {
    if (currentTrack) playQueue.unshift(currentTrack.query)
    const prevQuery = playHistory.pop()
    playTrack(prevQuery)
  } else if (currentTrack && mainWindow && !mainWindow.isDestroyed()) {
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('playback-stopped')
  }
  if (!app.isQuiting && !isManualStop) {
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
        { label: 'Next Track', click: () => { isManualStop = true; handleNextSong() } },
        { type: 'separator' },
        { label: 'Quit', click: () => { app.isQuiting = true; app.quit() } },
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

app.on('before-quit', () => {
  app.isQuiting = true
})

app.on('window-all-closed', () => {
  app.isQuiting = true
  app.quit()
})

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('close-app', () => {
  app.isQuiting = true
  app.quit()
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
    await electronAuthCommand((authUrl) => {
      const authWin = new BrowserWindow({
        width: 520,
        height: 720,
        title: 'Connect Spotify (MixTake)',
        alwaysOnTop: true,
        autoHideMenuBar: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        }
      })
      authWin.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
      
      const menu = Menu.buildFromTemplate([
        {
          label: '🌐 Open in Browser (1-Click)',
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
        console.log('[SpotifyAuth] Navigated to:', url)
        if (url.includes(':8888/callback')) {
          setTimeout(() => {
            if (!authWin.isDestroyed()) authWin.close()
          }, 1500)
        }
      })
      authWin.webContents.on('did-fail-load', (_, code, desc, url) => {
        console.log('[SpotifyAuth] Failed to load:', desc, url)
      })
      authWin.on('closed', () => {
        cancelAuthCallback()
      })
    })
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload()
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.reload()
  } catch (err) {
    console.warn('Auth canceled or failed:', err.message)
  }
})

ipcMain.handle('save-and-auth-browser', async (event, id, secret, redirectUri) => {
  saveAppCredentials({ clientId: id, clientSecret: secret, redirectUri })
  if (credsWindow) credsWindow.close()
  cancelAuthCallback()
  try {
    await electronAuthCommand((authUrl) => {
      shell.openExternal(authUrl)
    })
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload()
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.reload()
  } catch (err) {
    console.warn('Browser auth canceled or failed:', err.message)
  }
})

ipcMain.handle('get-spotify-creds', () => getAppCredentials())
ipcMain.handle('close-credentials-window', () => {
  if (credsWindow) credsWindow.close()
})

ipcMain.handle('is-logged-in', () => isLoggedIn())
ipcMain.handle('logout-spotify', () => {
  hardReset()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload()
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.reload()
})

let currentBackground = 'backgrounds/Evolving Universe.jpg'
ipcMain.on('change-background', (event, bgUrl) => {
  currentBackground = bgUrl
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('background-changed', bgUrl)
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('background-changed', bgUrl)
  }
})
ipcMain.handle('get-current-background', () => currentBackground)

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
  if (currentTrack && (!playHistory.length || playHistory[playHistory.length - 1] !== currentTrack.query)) {
    playHistory.push(currentTrack.query)
  }
  // Keep current song playing seamlessly until the new stream is fetched
  playTrack(query)
  return { success: true }
})

ipcMain.handle('add-queue', (event, query) => {
  playQueue.unshift(query)
  preloadNext()
  return playQueue
})

ipcMain.handle('get-queue', () => playQueue)

ipcMain.handle('clear-queue', () => {
  playQueue = []
  preloadedNextTrack = null
  return playQueue
})

ipcMain.handle('reorder-queue', (e, oldIndex, newIndex) => {
  if (oldIndex >= 0 && oldIndex < playQueue.length && newIndex >= 0 && newIndex < playQueue.length) {
    const [item] = playQueue.splice(oldIndex, 1)
    playQueue.splice(newIndex, 0, item)
    preloadNext()
  }
  return playQueue
})

ipcMain.handle('splice-queue', (e, start, deleteCount) => {
  playQueue.splice(start, deleteCount)
  preloadNext()
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
  return playQueue
})

ipcMain.handle('next-song', async () => {
  if (spotifySyncActive) {
    const spotify = await safeGetSpotifyClient()
    if (spotify) {
      try { await spotify.skipToNext() } catch (e) {}
      setTimeout(pollSpotifyPlayback, 400)
      return
    }
  }
  isManualStop = true
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('native-audio-cmd-stop')
  }
  handleNextSong()
})

ipcMain.handle('prev-song', async () => {
  if (spotifySyncActive) {
    const spotify = await safeGetSpotifyClient()
    if (spotify) {
      try { await spotify.skipToPrevious() } catch (e) {}
      setTimeout(pollSpotifyPlayback, 400)
      return
    }
  }
  isManualStop = true
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
          await spotify.play()
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

ipcMain.handle('seek', async (event, seconds) => {
  if (spotifySyncActive) {
    const spotify = await safeGetSpotifyClient()
    if (spotify) {
      try { await spotify.seek(Math.floor(seconds * 1000)) } catch (e) {}
      return
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('native-audio-cmd-seek', seconds)
  }
})

// ─── Spotify Live Sync ───────────────────────────────────────────────────────
let spotifySyncActive = false
let spotifySyncTimer = null

async function pollSpotifyPlayback() {
  if (!spotifySyncActive || !isLoggedIn()) return
  try {
    const spotify = await safeGetSpotifyClient()
    if (!spotify) return

    const res = await spotify.getMyCurrentPlaybackState()
    if (res && res.body && res.body.item) {
      const item = res.body.item
      const isPlaying = res.body.is_playing
      const progressSec = Math.floor((res.body.progress_ms || 0) / 1000)
      const durationSec = Math.floor((item.duration_ms || 0) / 1000)

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
        isPlaying,
        fromSpotify: true
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('spotify-sync-update', track)
      }
    }
  } catch (_) {}
}

async function setSpotifySync(enabled) {
  spotifySyncActive = enabled
  if (spotifySyncTimer) {
    clearInterval(spotifySyncTimer)
    spotifySyncTimer = null
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('spotify-sync-status-changed', enabled)
  }

  if (enabled) {
    // If a song is currently playing on OffTrack, replicate/handoff playback to Spotify!
    if (isNativeAudioPlaying && currentTrack && isLoggedIn()) {
      try {
        const spotify = await safeGetSpotifyClient()
        if (spotify) {
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
            console.log(`[SpotifySync] Transferring playback to Spotify: "${item.name}" by ${artistNames} at ${positionMs}ms`)
            
            const devRes = await spotify.getMyDevices()
            const devices = (devRes && devRes.body && devRes.body.devices) || []
            const targetDevice = devices.find(d => d.is_active) || devices[0]
            
            const playOpts = {
              uris: [item.uri],
              position_ms: positionMs
            }
            if (targetDevice) {
              playOpts.device_id = targetDevice.id
            }
            await spotify.play(playOpts)
          } else {
            console.warn(`[SpotifySync] No matching track found on Spotify for "${spotifyQuery}"`)
          }
        }
      } catch (err) {
        console.warn('[SpotifySync] Could not handoff song to Spotify:', err.message)
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('native-audio-cmd-stop')
    }
    isNativeAudioPlaying = false
    spotifySyncTimer = setInterval(pollSpotifyPlayback, 1200)
    setTimeout(pollSpotifyPlayback, 400)
  }
}

ipcMain.handle('toggle-spotify-sync', async (event, enable) => {
  await setSpotifySync(enable)
  return spotifySyncActive
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
  const spotify = await safeGetSpotifyClient()
  if (!spotify) return
  try { await spotify.skipToNext() } catch (e) {}
})

ipcMain.handle('spotify-remote-prev', async () => {
  const spotify = await safeGetSpotifyClient()
  if (!spotify) return
  try { await spotify.skipToPrevious() } catch (e) {}
})

ipcMain.handle('spotify-remote-seek', async (e, seconds) => {
  const spotify = await safeGetSpotifyClient()
  if (!spotify) return
  try { await spotify.seek(Math.floor(seconds * 1000)) } catch (e) {}
})