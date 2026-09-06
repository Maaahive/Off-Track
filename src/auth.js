import SpotifyWebApi from 'spotify-web-api-node'
import http from 'http'
import { createRequire } from 'module'
import chalk from 'chalk'
import 'dotenv/config'
import {
  getTokens, saveTokens, saveUserInfo, clearAll,
  isLoggedIn, getUserInfo, getAppCredentials, isTokenExpired
} from './config.js'

// open is an ESM package — handle gracefully
let openBrowser
try {
  const mod = await import('open')
  openBrowser = mod.default
} catch {
  openBrowser = null
}

function createSpotifyClient() {
  const creds = getAppCredentials()
  return new SpotifyWebApi({
    clientId:     creds.clientId || process.env.SPOTIFY_CLIENT_ID,
    clientSecret: creds.clientSecret || process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri:  creds.redirectUri || 'http://127.0.0.1:8888/callback',
  })
}

export function getSpotifyClient() {
  return createSpotifyClient()
}

export async function authCommand() {
  if (isLoggedIn()) {
    const { displayName } = getUserInfo()
    console.log(chalk.green(`\n  [Success] Already logged in as ${chalk.bold(displayName)}`))
    console.log(chalk.gray('  Run "musync logout" to switch accounts.\n'))
    return
  }

  const creds = getAppCredentials()
  if (!creds.clientId && !process.env.SPOTIFY_CLIENT_ID) {
    await checkSpotifyCredentials()
    
    // Check again, if they skipped the wizard we just return
    const credsAfter = getAppCredentials()
    if (!credsAfter.clientId && !process.env.SPOTIFY_CLIENT_ID) {
      return
    }
  }

  const spotify = createSpotifyClient()

  const scopes = [
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read',
    'user-read-private',
    'user-read-email',
  ]

  const authURL = spotify.createAuthorizeURL(scopes, 'musync-state')

  console.log(chalk.bold('\n  🔐 Spotify Login\n'))
  console.log(chalk.gray('  Opening browser for Spotify login...'))
  console.log(chalk.gray(`  If browser doesn't open, visit:\n  ${chalk.cyan(authURL)}\n`))

  if (openBrowser) {
    await openBrowser(authURL)
  } else {
    console.log(chalk.yellow('  Install "open" package for auto browser launch: npm install open'))
  }

  // start local server to catch the OAuth callback
  const code = await waitForCallback()

  const spinner = ora('  Authenticating with Spotify...').start()

  try {
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

    spinner.succeed(chalk.green(`  Logged in as ${chalk.bold(me.body.display_name)} [Success]\n`))
    process.exit(0)
  } catch (err) {
    spinner.fail(chalk.red(`  Auth failed: ${err.message}\n`))
    process.exit(1)
  }
}

export async function electronAuthCommand(openUrlFn) {
  const spotify = createSpotifyClient()
  const scopes = [
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read',
    'user-read-private',
    'user-read-email',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
  ]
  const authURL = spotify.createAuthorizeURL(scopes, 'musync-state')
  if (openUrlFn) {
    await openUrlFn(authURL)
  } else if (openBrowser) {
    await openBrowser(authURL)
  }
  const code = await waitForCallback()
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
  return { success: true, user: me.body.display_name }
}

let activeCallbackServer = null

export function cancelAuthCallback() {
  if (activeCallbackServer) {
    try {
      activeCallbackServer.close()
    } catch (_) {}
    activeCallbackServer = null
  }
}

function waitForCallback() {
  cancelAuthCallback()

  return new Promise((resolve, reject) => {
    let resolved = false
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1:8888')
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>OffTrack - Connection Error</title></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 60px 20px; background: #0f0f0f; color: #fff;">
              <div style="max-width: 480px; margin: 0 auto; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <div style="font-size: 40px; margin-bottom: 12px;">⚠️</div>
                <h2 style="color: #ff5f56; margin: 0 0 12px 0; font-size: 20px;">Spotify Authorization Failed</h2>
                <p style="color: #ccc; font-size: 14px; line-height: 1.5;">Spotify reported: <strong style="color: #fff;">${error}</strong></p>
                <div style="background: rgba(255, 95, 86, 0.1); border: 1px solid rgba(255, 95, 86, 0.2); border-radius: 8px; padding: 12px; margin-top: 16px; text-align: left; font-size: 12px; line-height: 1.5; color: #ff9999;">
                  💡 <strong>Tip for Developers:</strong> If your Spotify App is in <em>Development Mode</em>, make sure your Spotify account email is added under <strong>Settings ➔ User Management</strong> in your Spotify Developer Dashboard.
                </div>
              </div>
            </body>
            </html>
          `)
          resolved = true
          cancelAuthCallback()
          reject(new Error(`Spotify returned error: ${error}`))
          return
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>OffTrack - Connected!</title></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 60px 20px; background: #0f0f0f; color: #fff;">
              <div style="max-width: 480px; margin: 0 auto; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <div style="font-size: 40px; margin-bottom: 12px;">✨</div>
                <h2 style="color: #1db954; margin: 0 0 12px 0; font-size: 20px;">OffTrack Connected!</h2>
                <p style="color: #ccc; font-size: 14px; line-height: 1.5;">Spotify authorization was successful.</p>
                <p style="color: #777; font-size: 12px; margin-top: 16px;">You can close this window and return to OffTrack.</p>
              </div>
            </body>
            </html>
          `)
          resolved = true
          setTimeout(() => cancelAuthCallback(), 1000)
          resolve(code)
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('No authorization code received from Spotify.')
        }
      } catch (err) {
        cancelAuthCallback()
        reject(err)
      }
    })

    server.on('error', (err) => {
      console.warn('[SpotifyAuth] Server error:', err.message)
      activeCallbackServer = null
      if (!resolved) reject(err)
    })

    activeCallbackServer = server

    server.listen(8888, '0.0.0.0', () => {
      console.log('[SpotifyAuth] Listening on port 8888 for OAuth callback')
    })

    setTimeout(() => {
      if (!resolved) {
        cancelAuthCallback()
        reject(new Error('Authentication timed out after 2 minutes. Please try again.'))
      }
    }, 120_000)
  })
}

export async function logoutCommand() {
  clearAll()
  console.log(chalk.green('\n  [Success] Logged out successfully.\n'))
}

export async function getAuthenticatedClient() {
  if (!isLoggedIn()) {
    console.log(chalk.red('\n  [Error] Not logged in. Run: musync auth\n'))
    process.exit(1)
  }

  const spotify = createSpotifyClient()
  const { accessToken, refreshToken } = getTokens()

  spotify.setAccessToken(accessToken)
  spotify.setRefreshToken(refreshToken)

  if (isTokenExpired()) {
    try {
      const data = await spotify.refreshAccessToken()
      spotify.setAccessToken(data.body.access_token)
      saveTokens({
        accessToken:  data.body.access_token,
        refreshToken: data.body.refresh_token || refreshToken,
        expiresIn:    data.body.expires_in,
      })
    } catch (err) {
      console.log(chalk.red(`\n  [Error] Failed to refresh token: ${err.message}. Please run "musync logout" and "musync auth" again.\n`))
      process.exit(1)
    }
  }

  return spotify
}