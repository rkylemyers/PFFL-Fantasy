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
    // MFL API Login Endpoint: https://api.myfantasyleague.com/2026/login?USERNAME=...&PASSWORD=...&XML=1
    // We follow redirects (or handle both GET and POST) to guarantee we read the XML status or cookie header.
    let loginUrl = `https://api.myfantasyleague.com/2026/login?USERNAME=${encodeURIComponent(username)}&PASSWORD=${encodeURIComponent(password)}&XML=1`;
    let loginResp = await fetch(loginUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (PFFL-Fantasy)' }
    });

    let loginXml = await loginResp.text();
    let setCookieHeader = loginResp.headers.get('set-cookie') || '';

    // Check XML response body for: <status cookie_name="MFL_USER_ID" cookie_value="..."/>
    let cookieNameMatch = loginXml.match(/cookie_name="([^"]+)"/);
    let cookieValueMatch = loginXml.match(/cookie_value="([^"]+)"/);
    let authCookie = '';

    if (cookieNameMatch && cookieValueMatch) {
      authCookie = `${cookieNameMatch[1]}=${encodeURIComponent(cookieValueMatch[1])}`;
    } else if (setCookieHeader && setCookieHeader.includes('MFL_USER_ID=')) {
      const match = setCookieHeader.match(/MFL_USER_ID=([^;]+)/);
      if (match) {
        authCookie = `MFL_USER_ID=${match[1]}`;
      }
    }

    // If still no cookie, also try with league-specific server www44 as fallback
    if (!authCookie) {
      try {
        const leagueUrl = `https://www44.myfantasyleague.com/2026/login?L=44108&USERNAME=${encodeURIComponent(username)}&PASSWORD=${encodeURIComponent(password)}&XML=1`;
        const leagueResp = await fetch(leagueUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 (PFFL-Fantasy)' }
        });
        const leagueXml = await leagueResp.text();
        const lCookieNameMatch = leagueXml.match(/cookie_name="([^"]+)"/);
        const lCookieValueMatch = leagueXml.match(/cookie_value="([^"]+)"/);
        if (lCookieNameMatch && lCookieValueMatch) {
          authCookie = `${lCookieNameMatch[1]}=${encodeURIComponent(lCookieValueMatch[1])}`;
          loginXml = leagueXml;
        } else {
          // If leagueXml gave an error, keep it for diagnostics
          if (leagueXml.includes('<error>')) loginXml = leagueXml;
        }
      } catch (err) {
        console.warn('League login fallback error:', err);
      }
    }

    if (!authCookie) {
      const mflError = loginXml.match(/<error>([^<]+)<\/error>/);
      const errMsg = mflError ? mflError[1] : 'Invalid credentials or unexpected response from MFL';
      return res.status(401).json({
        success: false,
        error: errMsg,
        raw: loginXml,
        hint: 'MFL requires your master MFL Account credentials (often your email or username used on myfantasyleague.com).'
      });
    }

    // ── STEP 2: Handle different actions ─────────────────────────────────────
    if (action === 'test_auth') {
      // Just testing credentials — return success
      return res.status(200).json({ success: true, message: 'Login successful!' });
    }

    if (action === 'submit_lineup') {
      if (!leagueId || !week || !starters) {
        return res.status(400).json({ success: false, error: 'Missing lineup parameters.' });
      }

      // MFL API for TYPE=lineup expects a comma-separated list of starter player IDs:
      // Endpoint: https://api.myfantasyleague.com/2026/import?TYPE=lineup&L=${leagueId}&W=${week}&STARTERS=${starterList}&XML=1
      // If commissioner or submitting on franchise behalf, include FRANCHISE_ID=${franchiseId}
      const starterIds = starters.map(p => p.id).join(',');

      const params = new URLSearchParams({
        TYPE: 'lineup',
        L: String(leagueId),
        W: String(week),
        STARTERS: starterIds,
        XML: '1'
      });
      if (franchiseId) {
        params.append('FRANCHISE_ID', String(franchiseId));
      }

      // Try primary API endpoint first
      let importUrl = `https://api.myfantasyleague.com/2026/import?${params.toString()}`;
      let importResp = await fetch(importUrl, {
        method: 'POST',
        headers: {
          'Cookie': authCookie,
          'User-Agent': 'Mozilla/5.0 (PFFL-Fantasy)'
        }
      });

      let importText = await importResp.text();

      // If redirected or error, try the league-specific host (e.g. www44)
      if (!importText || importText.includes('<error>') || importResp.status >= 400) {
        try {
          const leagueImportUrl = `https://www44.myfantasyleague.com/2026/import?${params.toString()}`;
          const lResp = await fetch(leagueImportUrl, {
            method: 'POST',
            headers: {
              'Cookie': authCookie,
              'User-Agent': 'Mozilla/5.0 (PFFL-Fantasy)'
            }
          });
          const lText = await lResp.text();
          if (lText && !lText.includes('<error>')) {
            importText = lText;
          } else if (lText.includes('<error>')) {
            importText = lText; // capture league server error
          }
        } catch (err) {
          console.warn('League import fallback failed:', err);
        }
      }

      // Check success conditions
      const hasError = importText.includes('<error>');
      const isSuccess = !hasError && (
        importText.includes('<status') ||
        importText.includes('OK') ||
        importText.includes('success') ||
        importText.includes('<result>success')
      );

      let extractedError = null;
      if (hasError) {
        const errMatch = importText.match(/<error>([^<]+)<\/error>/);
        extractedError = errMatch ? errMatch[1] : 'MFL rejected lineup submission.';
      }

      return res.status(200).json({
        success: isSuccess,
        error: extractedError,
        raw: importText,
        message: isSuccess ? 'Lineup submitted successfully to MFL!' : (extractedError || 'MFL returned an error.')
      });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ success: false, error: `Server error: ${err.message}` });
  }
}
