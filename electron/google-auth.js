/**
 * Actra Browser - Google Auth Module
 * Handles OAuth2 authentication flow for Google Workspace via loopback server.
 */

const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const { shell } = require('electron');
const { default: Store } = require('electron-store');

class GoogleAuth {
  constructor() {
    this.store = new Store({ name: 'google-auth-tokens' });
    this.oauth2Client = null;
    this.scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive', // broader drive access for search & file creation
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/documents'
    ];
  }

  _initClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret || clientId === 'YOUR_GOOGLE_CLIENT_ID') {
      throw new Error('Google OAuth credentials missing in .env (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)');
    }

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'http://127.0.0.1:3001/oauth2callback' // Local loopback URL
    );

    // Load saved tokens if any
    const savedTokens = this.store.get('tokens');
    if (savedTokens) {
      // Verify scopes
      const hasAllScopes = this.scopes.every(scope => 
        savedTokens.scope && savedTokens.scope.includes(scope)
      );
      if (hasAllScopes) {
        this.oauth2Client.setCredentials(savedTokens);
      } else {
        console.log('[GoogleAuth] Existing token lacks new scopes. Clearing token to force re-auth.');
        this.store.delete('tokens');
      }
    }

    // Automatically save new tokens when refreshed
    this.oauth2Client.on('tokens', (tokens) => {
      const currentTokens = this.store.get('tokens') || {};
      this.store.set('tokens', { ...currentTokens, ...tokens });
      this.oauth2Client.setCredentials(this.store.get('tokens'));
    });
  }

  getClient() {
    if (!this.oauth2Client) {
      this._initClient();
    }
    return this.oauth2Client;
  }

  isAuthenticated() {
    try {
      const client = this.getClient();
      return !!client.credentials && !!client.credentials.access_token;
    } catch (e) {
      return false;
    }
  }

  async signIn() {
    return new Promise((resolve, reject) => {
      try {
        const client = this.getClient();
        
        // Spin up a local server to intercept the redirect
        const server = http.createServer(async (req, res) => {
          try {
            if (req.url.indexOf('/oauth2callback') > -1) {
              const qs = new url.URL(req.url, 'http://127.0.0.1:3001').searchParams;
              const code = qs.get('code');
              
              res.end('Authentication successful! You can close this tab and return to Actra.');
              
              const { tokens } = await client.getToken(code);
              this.store.set('tokens', tokens);
              client.setCredentials(tokens);
              
              server.close();
              resolve(true);
            }
          } catch (e) {
            server.close();
            reject(e);
          }
        });

        server.listen(3001, () => {
          // Open the browser to the authorize url
          const authorizeUrl = client.generateAuthUrl({
            access_type: 'offline',
            scope: this.scopes,
            prompt: 'consent' // Force to get refresh token
          });
          shell.openExternal(authorizeUrl);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  async signOut() {
    this.store.delete('tokens');
    if (this.oauth2Client) {
      this.oauth2Client.revokeCredentials();
      this.oauth2Client.credentials = {};
    }
  }
}

module.exports = new GoogleAuth();
