const fs = require('fs');
const path = require('path');
require('dotenv').config();

const outputDir = path.join(__dirname, '..', 'build', 'runtime-config');
const outputPath = path.join(outputDir, 'google-oauth.json');
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret || clientId === 'YOUR_GOOGLE_CLIENT_ID' || clientSecret === 'YOUR_GOOGLE_CLIENT_SECRET') {
  fs.rmSync(outputPath, { force: true });
  console.warn('[Build] Google OAuth credentials were not found; packaged Google sign-in will remain unavailable.');
  process.exit(0);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ clientId, clientSecret }, null, 2));
console.log('[Build] Prepared local Google OAuth runtime configuration.');
