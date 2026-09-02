import chalk from 'chalk'
import ora from 'ora'
import inquirer from 'inquirer'
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt'
import readline from 'readline'

inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt)
import { getAuthenticatedClient } from './auth.js'
import { searchAndPlay } from './youtube.js'
import { stopCurrentStream, pauseCurrentStream, resumeCurrentStream, toggleLoop, getIsLooping } from './player.js'
import { tui } from './tui.js'

import spotifyUrlInfo from 'spotify-url-info'
const { getTracks } = spotifyUrlInfo(fetch)

async function fetchSpotifyAPI(spotify, endpoint) {
  const token = spotify.getAccessToken()
  const res = await fetch(`https://api.spotify.com${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error?.message || res.statusText)
  }
  return res.json()
}

export async function listCommand() {
  const spotify = await getAuthenticatedClient()
  const spinner = ora('  Fetching your playlists...').start()

  try {
    // Fetch directly from Spotify Web API instead of deprecated library methods
    const data = await fetchSpotifyAPI(spotify, '/v1/me/playlists?limit=50')
    const likedData = await fetchSpotifyAPI(spotify, '/v1/me/tracks?limit=1').catch(() => null)
    spinner.stop()

    const playlists = []
    if (likedData && likedData.total > 0) {
      playlists.push({
        id: 'liked_songs',
        name: 'Liked Songs',
        items: { total: likedData.total }
      })
    }
    playlists.push(...data.items)

    if (!playlists.length) {
      console.log(chalk.yellow('\n  No playlists found.\n'))
      return
    }

    console.log(chalk.bold('\n  Your Playlists:\n'))
    playlists.forEach((pl, i) => {
      // The Spotify API has renamed 'tracks' to 'items' on the playlist object
      const trackInfo = pl.items || pl.tracks
      const count = trackInfo?.total !== undefined ? trackInfo.total : '?'
      console.log(
        chalk.gray(`  ${String(i + 1).padStart(2, ' ')}.`) +
        chalk.white(` ${pl.name}`) +
        chalk.gray(` (${count} tracks)`)
      )
    })
    console.log()
  } catch (err) {
    spinner.fail(chalk.red(`  Failed: ${err.message}\n`))
  }
}

export async function viewCommand(playlistInput) {
  let tracks = []
  const spinner = ora('  Fetching tracks...').start()

  try {
    const urlMatch = playlistInput.match(/playlist\/([a-zA-Z0-9]+)/)
    
    if (urlMatch || playlistInput.startsWith('http')) {
      const rawTracks = await getTracks(playlistInput)
      tracks = rawTracks.map(t => ({
        name: t.name,
        artist: t.artists?.[0]?.name || t.artist || 'Unknown',
        album: t.album?.name || ''
      }))
    } else {
      spinner.stop()
      const spotify = await getAuthenticatedClient()
      spinner.start()
      
      const playlistId = await findPlaylistByName(spotify, playlistInput)
      if (!playlistId) {
        spinner.stop()
        return
      }
      tracks = await getAllTracks(spotify, playlistId)
    }

    spinner.succeed(chalk.green(`  Found ${tracks.length} tracks`))
    
    if (!tracks.length) {
      console.log(chalk.yellow('\n  Playlist is empty.\n'))
      return
    }

    console.log(chalk.bold(`\n  Tracks in Playlist:\n`))
    tracks.forEach((t, i) => {
      console.log(chalk.gray(`  ${String(i + 1).padStart(3, ' ')}. `) + chalk.white(t.name) + chalk.gray(` — ${t.artist}`))
    })
    console.log()
  } catch (err) {
    spinner.fail(chalk.red(`  Error: ${err.message}\n`))
  }
}

export async function playCommand(playlistInput, options) {
  let tracks = []
  const spinner = ora('  Fetching tracks...').start()

  try {
    const urlMatch = playlistInput.match(/playlist\/([a-zA-Z0-9]+)/)
    
    if (urlMatch || playlistInput.startsWith('http')) {
      // No login required for public URLs! Scrape directly.
      const rawTracks = await getTracks(playlistInput)
      tracks = rawTracks.map(t => ({
        name: t.name,
        artist: t.artists?.[0]?.name || t.artist || 'Unknown',
        album: t.album?.name || ''
      }))
    } else {
      // Require login to search personal playlists by name
      spinner.stop()
      const spotify = await getAuthenticatedClient()
      spinner.start()
      
      const playlistId = await findPlaylistByName(spotify, playlistInput)
      if (!playlistId) {
        spinner.stop()
        return
      }
      tracks = await getAllTracks(spotify, playlistId)
    }

    spinner.succeed(chalk.green(`  Found ${tracks.length} tracks`))
    if ((urlMatch || playlistInput.startsWith('http')) && tracks.length === 100) {
      console.log(chalk.yellow('\n  [Warning] Notice: Spotify limits public URL previews to 100 tracks.'))
      console.log(chalk.yellow('  To play the rest of this playlist, you must connect your account by running: ') + chalk.bold.cyan('musync auth\n'))
    }

    if (!tracks.length) {
      console.log(chalk.yellow('\n  Playlist is empty.\n'))
      return
    }

    let queue = tracks
    let currentIndex = 0

    if (!options.shuffle) {
      console.log(chalk.bold(`\n  Playlist Tracks:\n`))
      tracks.forEach((t, i) => {
        console.log(chalk.gray(`  ${String(i + 1).padStart(3, ' ')}. `) + chalk.white(t.name) + chalk.gray(` — ${t.artist}`))
      })
      console.log()

      const choices = [
        { name: chalk.yellow('▶ Play all from beginning'), value: 'play' },
        { name: chalk.cyan('🔀 Shuffle all tracks'), value: 'shuffle' },
        new inquirer.Separator()
      ]

      tracks.forEach((t, i) => {
        choices.push({
          name: chalk.gray(`${String(i + 1).padStart(3, ' ')}. `) + chalk.white(t.name) + chalk.gray(` — ${t.artist}`),
          value: i
        })
      })

      const searchTracks = (answers, input = '') => {
        return new Promise((resolve) => {
          const results = choices.filter(choice => {
            if (choice instanceof inquirer.Separator) return true
            return choice.name.toLowerCase().includes(input.toLowerCase())
          })
          resolve(results)
        })
      }

      const { action } = await inquirer.prompt([{
        type: 'autocomplete',
        name: 'action',
        message: 'Type a track number to play, use arrow keys to scroll, or choose an option:',
        source: searchTracks,
        pageSize: 15
      }])

      if (action === 'shuffle') {
        queue = shuffleArray([...tracks])
      } else if (action !== 'play') {
        currentIndex = parseInt(action, 10)
      }
    } else {
      queue = shuffleArray([...tracks])
    }

    let isPaused = false
    let isQuit = false
    let nextCustomQuery = null // To hold a custom search query
    let isCommandMode = false
    let commandBuffer = ''
    let userQueue = []

    const setupInput = () => {
      readline.emitKeypressEvents(process.stdin)
      if (process.stdin.isTTY) process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.on('keypress', handleInput)
    }

    const teardownInput = () => {
      process.stdin.off('keypress', handleInput)
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdin.pause()
    }

    const handleInput = async (str, key) => {
      if (!key) return

      if (isCommandMode) {
        if (key.name === 'return' || key.name === 'enter') {
          isCommandMode = false
          tui.updateState({ commandInput: undefined })
          const val = commandBuffer.trim()
          const num = parseInt(val, 10)
          
          if (!isNaN(num) && num > 0 && num <= tracks.length) {
            const targetTrack = tracks[num - 1]
            const targetIndex = queue.indexOf(targetTrack)
            currentIndex = targetIndex - 1
            stopCurrentStream(true)
          } else if (val.length > 0) {
            if (val.startsWith('+')) {
              const queueItem = val.slice(1).trim()
              if (queueItem) userQueue.push(queueItem)
              tui.updateState({ userQueue: [...userQueue], commandInput: `Queued: ${queueItem}` })
              setTimeout(() => {
                if (!isCommandMode) {
                  tui.updateState({ commandInput: undefined })
                  tui.render()
                }
              }, 1500)
            } else if (val.startsWith('-')) {
              const queueItem = val.slice(1).trim()
              if (!queueItem) {
                userQueue.pop()
              } else {
                const num = parseInt(queueItem, 10)
                if (!isNaN(num) && num > 0 && num <= userQueue.length && num.toString() === queueItem) {
                  userQueue.splice(num - 1, 1)
                } else {
                  const lower = queueItem.toLowerCase()
                  const idx = userQueue.findIndex(q => q.toLowerCase().includes(lower))
                  if (idx !== -1) {
                    userQueue.splice(idx, 1)
                  }
                }
              }
              tui.updateState({ userQueue: [...userQueue], commandInput: undefined })
            } else {
              nextCustomQuery = val
              stopCurrentStream(true)
            }
          } else {
            tui.updateState({ commandInput: undefined })
          }
          tui.render()
        } else if (key.name === 'escape') {
          isCommandMode = false
          tui.updateState({ commandInput: undefined })
          tui.render()
        } else if (key.name === 'backspace') {
          commandBuffer = commandBuffer.slice(0, -1)
          tui.updateState({ commandInput: commandBuffer })
          tui.render()
        } else if (str && str.length === 1) {
          commandBuffer += str
          tui.updateState({ commandInput: commandBuffer })
          tui.render()
        }
        return
      }

      if ((key.ctrl && key.name === 'c') || key.name === 'q') {
        stopCurrentStream()
        process.exit(0)
      } else if (key.name === 'n' || key.name === 'right') {
        stopCurrentStream() 
      } else if (key.name === 'p' || key.name === 'left') {
        if (!getIsLooping()) {
          currentIndex = Math.max(-1, currentIndex - 2) 
        }
        stopCurrentStream()
      } else if (key.name === 's' || key.name === 'space') {
        if (isPaused) {
          resumeCurrentStream()
          isPaused = false
          tui.updateState({ isPaused: false })
          tui.render()
        } else {
          pauseCurrentStream()
          isPaused = true
          tui.updateState({ isPaused: true })
          tui.render()
        }
      } else if (key.name === 'c') {
        tui.cycleAnimation()
        tui.render()
      } else if (key.name === 'v') {
        tui.cycleColor()
        tui.render()
      } else if (str === '+' || str === '=') {
        tui.increaseSpeed()
        tui.render()
      } else if (str === '-' || str === '_') {
        tui.decreaseSpeed()
        tui.render()
      } else if (key.name === 'l') {
        toggleLoop()
      } else if (str === '/' || key.name === '/') {
        isCommandMode = true
        commandBuffer = ''
        tui.updateState({ commandInput: commandBuffer })
        tui.render()
      }
    }

    setupInput()

    tui.enterAlternateScreen()

    for (; currentIndex < queue.length; currentIndex++) {
      if (isQuit) break
      
      let query
      const track = queue[currentIndex]
      
      if (userQueue.length > 0) {
        query = userQueue.shift()
        tui.updateState({
          title: `Custom Search: ${query}`,
          artist: '',
          nextTrack: track ? `${track.name} — ${track.artist}` : 'None',
          playlistPosition: '',
          userQueue: [...userQueue]
        })
        currentIndex-- 
      } else if (nextCustomQuery) {
        query = nextCustomQuery
        tui.updateState({
          title: `Custom Search: ${query}`,
          artist: '',
          nextTrack: track ? `${track.name} — ${track.artist}` : 'None',
          playlistPosition: '',
          coverLines: null
        })
        currentIndex-- 
        nextCustomQuery = null
      } else {
        query = `${track.name} ${track.artist} lyric video`
        const next = queue[currentIndex + 1]
        const originalNumber = tracks.indexOf(track) + 1
        tui.updateState({
          title: track.name,
          artist: track.artist,
          nextTrack: next ? `${next.name} — ${next.artist}` : 'None',
          playlistPosition: `[${originalNumber}/${queue.length}]`,
          coverLines: null
        })
      }

      tui.render()

      if (process.stdin.isTTY) process.stdin.setRawMode(true)
      process.stdin.resume()

      isPaused = false
      tui.updateState({ isPaused: false })
      await searchAndPlay(query)
    }

    tui.leaveAlternateScreen()
    teardownInput()

    if (!isQuit) console.log(chalk.green('\n  [Success] Playlist finished!\n'))
  } catch (err) {
    spinner.fail(chalk.red(`  Error: ${err.message}\n`))
  }
}

async function findPlaylistByName(spotify, name) {
  const spinner = ora('  Searching playlists...').start()

  try {
    // Fetch directly from Spotify Web API instead of deprecated library methods
    const data = await fetchSpotifyAPI(spotify, '/v1/me/playlists?limit=50')
    const likedData = await fetchSpotifyAPI(spotify, '/v1/me/tracks?limit=1').catch(() => null)
    spinner.stop()

    const playlists = []
    if (likedData && likedData.total > 0) {
      playlists.push({ id: 'liked_songs', name: 'Liked Songs' })
    }
    playlists.push(...data.items)

    const matches   = playlists.filter(pl =>
      pl.name.toLowerCase().includes(name.toLowerCase())
    )

    if (!matches.length) {
      console.log(chalk.red(`\n  No playlist found matching "${name}"\n`))
      console.log(chalk.gray('  Run "musync list" to see all your playlists.\n'))
      return null
    }

    if (matches.length === 1) return matches[0].id

    // multiple matches — let user pick
    const { chosen } = await inquirer.prompt([{
      type:    'list',
      name:    'chosen',
      message: 'Multiple playlists found. Which one?',
      choices: matches.map(pl => ({ name: pl.name, value: pl.id })),
    }])

    return chosen
  } catch (err) {
    spinner.fail(chalk.red(`  Failed: ${err.message}`))
    return null
  }
}

async function getAllTracks(spotify, playlistId) {
  const tracks = []
  let offset   = 0
  const limit  = playlistId === 'liked_songs' ? 50 : 100 // Spotify API max limits

  while (true) {
    let url
    if (playlistId === 'liked_songs') {
      url = `/v1/me/tracks?limit=${limit}&offset=${offset}`
    } else {
      const fields = encodeURIComponent('items(item(name,artists,album,is_local)),next,total')
      url = `/v1/playlists/${playlistId}/items?limit=${limit}&offset=${offset}&fields=${fields}`
    }
    
    const data = await fetchSpotifyAPI(spotify, url)

    const items = data.items
    const total = data.total

    if (!items || items.length === 0) break

    // Process and push current chunk into master array
    for (const obj of items) {
      const trackObj = obj.item || obj.track
      if (!trackObj || trackObj.is_local || !trackObj.name) continue
      
      tracks.push({
        name:   trackObj.name,
        artist: trackObj.artists?.[0]?.name ?? 'Unknown',
        album:  trackObj.album?.name ?? '',
      })
    }

    // Break conditions: Either we've accumulated everything up to the reported 'total',
    // or the API returned a smaller chunk than requested, meaning we hit the end.
    if (tracks.length >= total || items.length < limit) {
      break
    }
    
    // Increment the offset to catch the next chunk on the next iteration loop
    offset += limit
  }

  return tracks
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}