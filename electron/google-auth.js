const { google } = require('googleapis');

const { shell } = require('electron');
const http = require('http');
const url = require('url');
const supabase = require('./supabase');

class GoogleAuth {
  constructor() {
    this.oauth2Client = null;
    this.scopes = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/calendar'
    ];
    // Fallback local store removed, we use Supabase now
  }

  async _initClient() {
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

    // Get user from Supabase session
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Load saved tokens if any
      const { data } = await supabase.from('google_auth_tokens').select('tokens').eq('user_id', user.id).single();
      const savedTokens = data?.tokens;

      if (savedTokens) {
        // Verify scopes
        const hasAllScopes = this.scopes.every(scope => 
          savedTokens.scope && savedTokens.scope.includes(scope)
        );
        if (hasAllScopes) {
          this.oauth2Client.setCredentials(savedTokens);
        } else {
          console.log('[GoogleAuth] Existing token lacks new scopes. Clearing token to force re-auth.');
          await supabase.from('google_auth_tokens').delete().eq('user_id', user.id);
        }
      }
    }

    // Automatically save new tokens when refreshed
    this.oauth2Client.on('tokens', async (tokens) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('google_auth_tokens').select('tokens').eq('user_id', user.id).single();
        const currentTokens = data?.tokens || {};
        const newTokens = { ...currentTokens, ...tokens };
        await supabase.from('google_auth_tokens').upsert({ user_id: user.id, tokens: newTokens });
        this.oauth2Client.setCredentials(newTokens);
      }
    });
  }

  async getClient() {
    if (!this.oauth2Client) {
      await this._initClient();
    }
    return this.oauth2Client;
  }

  async isAuthenticated() {
    try {
      const client = await this.getClient();
      return !!client.credentials && !!client.credentials.access_token;
    } catch (e) {
      return false;
    }
  }

  async signIn() {
    return new Promise(async (resolve, reject) => {
      try {
        const client = await this.getClient();
        
        // Spin up a local server to intercept the redirect
        const server = http.createServer(async (req, res) => {
          try {
            if (req.url.indexOf('/oauth2callback') > -1) {
              const qs = new url.URL(req.url, 'http://127.0.0.1:3001').searchParams;
              const code = qs.get('code');
              
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <title>Authentication Successful</title>
                    <style>
                      body {
                        margin: 0;
                        padding: 0;
                        background-color: #FDFBF7;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                      }
                      .container {
                        text-align: center;
                        animation: fadeIn 0.5s ease-out;
                      }
                      .tick-circle {
                        width: 120px;
                        height: 120px;
                        border-radius: 50%;
                        background-color: #4CAF50;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        margin: 0 auto 30px;
                        box-shadow: 0 10px 20px rgba(76, 175, 80, 0.2);
                        animation: scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.2s both;
                      }
                      .tick {
                        color: white;
                        font-size: 60px;
                        line-height: 1;
                        font-weight: bold;
                        animation: drawTick 0.5s ease-out 0.5s both;
                        opacity: 0;
                      }
                      h1 {
                        color: #1a1a1a;
                        margin-bottom: 10px;
                        font-size: 28px;
                      }
                      p {
                        color: #666;
                        font-size: 16px;
                      }
                      @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                      }
                      @keyframes scaleIn {
                        from { transform: scale(0); }
                        to { transform: scale(1); }
                      }
                      @keyframes drawTick {
                        from { opacity: 0; transform: scale(0.5); }
                        to { opacity: 1; transform: scale(1); }
                      }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="tick-circle">
                        <div class="tick">&#10003;</div>
                      </div>
                      <h1>Authentication Successful</h1>
                      <p>You can safely close this tab and return to Actra.</p>
                    </div>
                    <script>
                      setTimeout(() => {
                        window.close();
                      }, 3000);
                    </script>
                  </body>
                </html>
              `);
              
              const { tokens } = await client.getToken(code);
              
              if (tokens.id_token) {
                const { data, error } = await supabase.auth.signInWithIdToken({
                  provider: 'google',
                  token: tokens.id_token
                });
                if (error) {
                  console.error('Supabase auth error:', error);
                } else if (data.user) {
                   await supabase.from('google_auth_tokens').upsert({ user_id: data.user.id, tokens });
                }
              } else {
                 console.warn("No id_token received from Google, cannot sign into Supabase.");
              }
              
              client.setCredentials(tokens);
              
              server.close();
              resolve({ success: true, id_token: tokens.id_token });
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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('google_auth_tokens').delete().eq('user_id', user.id);
    }
    await supabase.auth.signOut();
    if (this.oauth2Client) {
      this.oauth2Client.revokeCredentials();
      this.oauth2Client.credentials = {};
    }
  }
}

module.exports = new GoogleAuth();
