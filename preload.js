const { contextBridge, ipcRenderer } = require('electron')

// ─── Windows Native In-Window Audio Engine ───────────────────────────────────
// Built-in HTML5 Audio player running directly inside Chromium
let nativeAudio = null

function getAudio() {
  if (!nativeAudio) {
    nativeAudio = new Audio()
    nativeAudio.preload = 'auto'

    nativeAudio.addEventListener('timeupdate', () => {
      ipcRenderer.send('native-audio-time', nativeAudio.currentTime)
    })

    nativeAudio.addEventListener('play', () => {
      ipcRenderer.send('native-audio-state', false)
    })

    nativeAudio.addEventListener('pause', () => {
      ipcRenderer.send('native-audio-state', true)
    })

    nativeAudio.addEventListener('ended', () => {
      ipcRenderer.send('native-audio-ended')
    })

    nativeAudio.addEventListener('error', (e) => {
      console.error('[NativeAudio] Stream error:', e)
      ipcRenderer.send('native-audio-error', nativeAudio.error ? nativeAudio.error.message : 'Playback error')
    })
  }
  return nativeAudio
}

// Commands from main.js to the audio element
ipcRenderer.on('native-audio-cmd-play', (_, { streamUrl }) => {
  const audio = getAudio()
  audio.pause()
  audio.src = streamUrl
  audio.load()
  const p = audio.play()
  if (p && p.catch) {
    p.catch(err => {
      console.warn('[NativeAudio] Play caught error:', err.message)
    })
  }
})

ipcRenderer.on('native-audio-cmd-toggle-pause', () => {
  const audio = getAudio()
  if (audio.paused) {
    audio.play().catch(e => console.warn(e))
  } else {
    audio.pause()
  }
})

ipcRenderer.on('native-audio-cmd-seek', (_, seconds) => {
  const audio = getAudio()
  audio.currentTime = seconds
})

ipcRenderer.on('native-audio-cmd-stop', () => {
  const audio = getAudio()
  audio.pause()
  audio.currentTime = 0
})

ipcRenderer.on('native-audio-cmd-loop', (_, isLooping) => {
  const audio = getAudio()
  audio.loop = isLooping
})

// ─── Trak API Surface ────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('api', {
  close: () => ipcRenderer.invoke('close-app'),
  minimize: () => ipcRenderer.invoke('minimize-app'),
  saveCustomTheme: (theme) => ipcRenderer.invoke('save-custom-theme', theme),
  deleteCustomTheme: (themeName) => ipcRenderer.invoke('delete-custom-theme', themeName),
  loadCustomThemes: () => ipcRenderer.invoke('load-custom-themes'),
  searchSong: (query) => ipcRenderer.invoke('search-song', query),
  openCredentialsWindow: () => ipcRenderer.invoke('open-credentials-window'),
  closeCredentialsWindow: () => ipcRenderer.invoke('close-credentials-window'),
  saveSpotifyCreds: (id, secret, redirectUri) => ipcRenderer.invoke('save-spotify-creds', id, secret, redirectUri),
  saveAndAuthBrowser: (id, secret, redirectUri) => ipcRenderer.invoke('save-and-auth-browser', id, secret, redirectUri),
  getSpotifyCreds: () => ipcRenderer.invoke('get-spotify-creds'),
  isLoggedIn: () => ipcRenderer.invoke('is-logged-in'),
  logoutSpotify: () => ipcRenderer.invoke('logout-spotify'),
  togglePlay: () => ipcRenderer.invoke('toggle-play'),
  seek: (seconds) => ipcRenderer.invoke('seek', seconds),
  nextSong: () => ipcRenderer.invoke('next-song'),
  prevSong: () => ipcRenderer.invoke('prev-song'),
  toggleLoop: () => ipcRenderer.invoke('toggle-loop'),
  toggleShuffle: () => ipcRenderer.invoke('toggle-shuffle'),
  addQueue: (query) => ipcRenderer.invoke('add-queue', query),
  getQueue: () => ipcRenderer.invoke('get-queue'),
  clearQueue: () => ipcRenderer.invoke('clear-queue'),
  setQueue: (queueArray) => ipcRenderer.invoke('set-queue', queueArray),
  reorderQueue: (oldIndex, newIndex) => ipcRenderer.invoke('reorder-queue', oldIndex, newIndex),
  spliceQueue: (start, count) => ipcRenderer.invoke('splice-queue', start, count),
  getPlaylists: () => ipcRenderer.invoke('get-playlists'),
  getPlaylistTracks: (id) => ipcRenderer.invoke('get-playlist-tracks', id),
  fetchPlaylistUrl: (url) => ipcRenderer.invoke('fetch-playlist-url', url),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  closeSettings: () => ipcRenderer.invoke('close-settings'),
  changeBackground: (bgUrl) => ipcRenderer.send('change-background', bgUrl),
  onBackgroundChanged: (callback) => ipcRenderer.on('background-changed', (_, bgUrl) => callback(bgUrl)),
  getCurrentBackground: () => ipcRenderer.invoke('get-current-background'),
  onTrackStarted: (callback) => ipcRenderer.on('track-started', callback),
  onTrackLoading: (callback) => ipcRenderer.on('track-loading', callback),
  onTrackError: (callback) => ipcRenderer.on('track-error', callback),
  onLoopToggled: (callback) => ipcRenderer.on('loop-toggled', callback),
  onShuffleToggled: (callback) => ipcRenderer.on('shuffle-toggled', callback),
  onPlaybackTime: (callback) => ipcRenderer.on('playback-time', callback),
  onPlaybackStopped: (callback) => ipcRenderer.on('playback-stopped', callback),
  onPlaybackStateUpdate: (callback) => ipcRenderer.on('playback-state-update', callback),
  onPlaylistsUpdated: (callback) => ipcRenderer.on('playlists-updated', callback),
  openGifWindow: () => ipcRenderer.invoke('open-gif-window'),
  selectGif: (gifUrl, gifName) => ipcRenderer.invoke('select-gif', gifUrl, gifName),
  onGifSelected: (callback) => ipcRenderer.on('gif-selected', callback),
  updateGlobalShortcut: (shortcut) => ipcRenderer.invoke('update-global-shortcut', shortcut),
  registerGlobalShortcuts: (shortcuts) => ipcRenderer.invoke('register-global-shortcuts', shortcuts),
  onGlobalAction: (callback) => ipcRenderer.on('global-action', callback),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  syncSettings: (settings) => ipcRenderer.invoke('sync-settings', settings),
  onSettingsSynced: (callback) => ipcRenderer.on('settings-synced', callback),
  toggleSpotifySync: (enable) => ipcRenderer.invoke('toggle-spotify-sync', enable),
  getSpotifySyncStatus: () => ipcRenderer.invoke('get-spotify-sync-status'),
  spotifyRemotePlayPause: () => ipcRenderer.invoke('spotify-remote-play-pause'),
  spotifyRemoteNext: () => ipcRenderer.invoke('spotify-remote-next'),
  spotifyRemotePrev: () => ipcRenderer.invoke('spotify-remote-prev'),
  spotifyRemoteSeek: (seconds) => ipcRenderer.invoke('spotify-remote-seek', seconds),
  onSpotifySyncUpdate: (callback) => ipcRenderer.on('spotify-sync-update', callback),
})