/**
 * Vercel Serverless Function: MFL Authentication Proxy
 * 
 * This runs on Vercel's servers (NOT in the browser), so it can call
 * MFL's API without CORS restrictions. It:
 *   1. Accepts POST requests from the PFFL app with {username, password, ...}
 *   2. Logs into MFL server-to-server to get an auth cookie
 *   3. Submits the lineup/action to MFL using that cookie
 *   4. Returns the real MFL response to the browser
 */

export default async function handler(req, res) {
  // Always allow cross-origin requests from your GitHub Pages app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle browser CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, username, password, leagueId, franchiseId, week, starters, bench } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Missing username or password.' });
  }

  try {
    // ── STEP 1: Login to MFL ──────────────────────────────────────────────────
    // Use POST as MFL recommends. Don't follow redirects so we always read the raw XML.
    const loginResp = await fetch('https://api.myfantasyleague.com/2026/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `USERNAME=${encodeURIComponent(username)}&PASSWORD=${encodeURIComponent(password)}&XML=1`,
      redirect: 'manual'
    });
    
    // If MFL redirects (3xx), grab the Set-Cookie header from the redirect response
    let mflCookieHeader = loginResp.headers.get('set-cookie') || '';
    const loginXml = loginResp.type === 'opaqueredirect' ? '' : await loginResp.text();
    
    console.log('MFL login status:', loginResp.status, loginResp.type);
    console.log('MFL response body:', loginXml.substring(0, 300));
    console.log('MFL cookie header:', mflCookieHeader.substring(0, 100));

    // Parse the cookie name/value from the XML response body
    // Expected success: <status cookie_name="MFL_USER_ID" cookie_value="xxxx" ...>
    const cookieNameMatch = loginXml.match(/cookie_name="([^"]+)"/);
    const cookieValueMatch = loginXml.match(/cookie_value="([^"]+)"/);

    if (!cookieNameMatch || !cookieValueMatch) {
      // Login failed — return the raw error from MFL
      const mflError = loginXml.match(/<error>([^<]+)<\/error>/);
      const errMsg = mflError ? mflError[1] : `Unexpected MFL response format`;
      return res.status(401).json({
        success: false,
        error: errMsg,
        raw: loginXml,
        hint: 'Use your MFL Account password (not your Franchise Access Code). Your username is your MFL login email or username.'
      });
    }

    const cookieName = cookieNameMatch[1];
    const cookieValue = cookieValueMatch[1];
    const authCookie = `${cookieName}=${encodeURIComponent(cookieValue)}`;

    // ── STEP 2: Handle different actions ─────────────────────────────────────
    if (action === 'test_auth') {
      // Just testing credentials — return success
      return res.status(200).json({ success: true, message: 'Login successful!' });
    }

    if (action === 'submit_lineup') {
      if (!leagueId || !franchiseId || !week || !starters) {
        return res.status(400).json({ success: false, error: 'Missing lineup parameters.' });
      }

      // Build the XML lineup payload
      // MFL expects the same format as its export: starters listed by player ID
      // Slot mapping: QB, RB, RB, WR, WR, TE, FLEX, K, Def
      const mflSlotMap = {
        QB: 'QB', RB1: 'RB', RB2: 'RB',
        WR1: 'WR', WR2: 'WR', TE: 'TE',
        FLEX: 'WR', K: 'PK', DST: 'Def'
      };

      const starterXml = starters.map(p =>
        `  <player id="${p.id}" slot="${mflSlotMap[p.slot] || p.slot}"/>`
      ).join('\n');

      const benchXml = (bench || []).map(p =>
        `  <player id="${p.id}" slot="nonstarter"/>`
      ).join('\n');

      const lineupXml = `<?xml version="1.0" encoding="utf-8"?>\n<lineup>\n${starterXml}\n${benchXml}\n</lineup>`;

      const importUrl = `https://api.myfantasyleague.com/2026/import?TYPE=lineup&L=${leagueId}&FRANCHISE_ID=${franchiseId}&WEEK=${week}`;
      const importResp = await fetch(importUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': authCookie
        },
        body: `DATA=${encodeURIComponent(lineupXml)}`
      });

      const importText = await importResp.text();
      const importSuccess = importText.includes('<result>success</result>') ||
                            importText.includes('status="success"') ||
                            importText.includes('<status value="success"');

      return res.status(200).json({
        success: importSuccess,
        raw: importText,
        message: importSuccess ? 'Lineup submitted successfully!' : 'MFL returned an error. Check raw response.',
      });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ success: false, error: `Server error: ${err.message}` });
  }
}
