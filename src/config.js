import Conf from 'conf'

const config = new Conf({
  projectName: 'musync',
  schema: {
    accessToken:    { type: 'string', default: '' },
    refreshToken:   { type: 'string', default: '' },
    tokenExpiry:    { type: 'number', default: 0  },
    setupComplete:  { type: 'boolean', default: false },
    spotifyUserId:  { type: 'string', default: '' },
    displayName:    { type: 'string', default: '' },
    spotifyClientId:     { type: 'string', default: '' },
    spotifyClientSecret: { type: 'string', default: '' },
    redirectUri:         { type: 'string', default: 'http://127.0.0.1:8888/callback' },
  }
})

export function getTokens() {
  return {
    accessToken:  config.get('accessToken'),
    refreshToken: config.get('refreshToken'),
    tokenExpiry:  config.get('tokenExpiry'),
  }
}

export function saveTokens({ accessToken, refreshToken, expiresIn }) {
  config.set('accessToken',  accessToken)
  config.set('refreshToken', refreshToken)
  config.set('tokenExpiry',  Date.now() + expiresIn * 1000)
}

export function saveUserInfo({ id, displayName }) {
  config.set('spotifyUserId', id)
  config.set('displayName',   displayName)
}

export function getUserInfo() {
  return {
    id:          config.get('spotifyUserId'),
    displayName: config.get('displayName'),
  }
}

export function getAppCredentials() {
  return {
    clientId:     config.get('spotifyClientId'),
    clientSecret: config.get('spotifyClientSecret'),
    redirectUri:  config.get('redirectUri') || 'http://127.0.0.1:8888/callback',
  }
}

export function saveAppCredentials({ clientId, clientSecret, redirectUri }) {
  config.set('spotifyClientId',     clientId)
  config.set('spotifyClientSecret', clientSecret)
  if (redirectUri) config.set('redirectUri', redirectUri)
}

export function isTokenExpired() {
  return Date.now() > config.get('tokenExpiry')
}

export function isLoggedIn() {
  return !!config.get('accessToken')
}

export function isSetupComplete() {
  return config.get('setupComplete')
}

export function markSetupComplete() {
  config.set('setupComplete', true)
}

export function clearAll() {
  config.delete('accessToken')
  config.delete('refreshToken')
  config.delete('tokenExpiry')
  config.delete('spotifyUserId')
  config.delete('displayName')
}

export function hardReset() {
  config.clear()
}