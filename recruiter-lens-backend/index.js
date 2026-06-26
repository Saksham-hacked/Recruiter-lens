require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

const apiKeyMiddleware = require('./middleware/apiKey');
const apiLogger = require('./middleware/apiLogger');
const { saveInitialTokens } = require('./services/tokenManager');
const { startTokenRefreshJob } = require('./jobs/tokenRefresh');

const lookupRouter = require('./routes/lookup');
const candidateRouter = require('./routes/candidate');
const healthRouter = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Global middleware ────────────────────────────────────────────────────────
app.use(cors()); // Internal tool — allow all origins
app.use(express.json());

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use(limiter);

// Log every request to the terminal
app.use(apiLogger);

// ── OAuth setup routes (NO API key protection — run once during setup) ────────

/**
 * GET /oauth/start
 * Open this in your browser to kick off Zoho OAuth.
 * Redirects to Zoho's consent screen.
 */
app.get('/oauth/start', (req, res) => {
  const params = new URLSearchParams({
    scope: 'ZohoRecruit.modules.ALL,ZohoRecruit.settings.ALL',
    client_id: process.env.ZOHO_CLIENT_ID,
    response_type: 'code',
    access_type: 'offline',
    redirect_uri: process.env.ZOHO_REDIRECT_URI,
  });

  const authUrl = `${process.env.ZOHO_ACCOUNTS_URL}/auth?${params.toString()}`;
  res.redirect(authUrl);
});

/**
 * GET /oauth/callback
 * Zoho redirects here after the user approves access.
 * Exchanges the auth code for tokens and saves them to Supabase.
 */
app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code from Zoho.' });
  }

  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      redirect_uri: process.env.ZOHO_REDIRECT_URI,
      code,
    });

    const response = await axios.post(
      `${process.env.ZOHO_ACCOUNTS_URL}/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, error: zohoError } = response.data;

    if (!access_token || !refresh_token) {
      throw new Error(`Zoho did not return tokens: ${zohoError || JSON.stringify(response.data)}`);
    }

    await saveInitialTokens(access_token, refresh_token);

    return res.json({
      message: 'Zoho OAuth setup complete. You can now use the extension.',
    });
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error(`[${new Date().toISOString()}] /oauth/callback error:`, msg);
    return res.status(500).json({ error: `OAuth callback failed: ${msg}` });
  }
});

// ── Health check (no API key required) ──────────────────────────────────────
app.use('/health', healthRouter);

// ── Protected routes (API key required for everything below) ─────────────────
app.use(apiKeyMiddleware);

app.use('/lookup', lookupRouter);
app.use('/candidate', candidateRouter);

// ── 404 fallback ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
  startTokenRefreshJob();
});
