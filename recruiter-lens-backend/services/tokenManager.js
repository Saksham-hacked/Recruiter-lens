const axios = require('axios');
const supabase = require('../db/supabase');

const ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL;
const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;

// Buffer: refresh token if it expires within 5 minutes
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// Tokens are stored just under 1 hour (3500 seconds) to be safe
const TOKEN_LIFETIME_MS = 3500 * 1000;

/**
 * Returns a valid Zoho access token.
 * Refreshes automatically if the token is within 5 minutes of expiry.
 */
async function getAccessToken() {
  const { data, error } = await supabase
    .from('zoho_tokens')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data || !data.access_token) {
    throw new Error(
      'Zoho tokens not initialized. Run the OAuth setup first by visiting /oauth/start in your browser.'
    );
  }

  const isExpiringSoon = data.expires_at < Date.now() + EXPIRY_BUFFER_MS;

  if (isExpiringSoon) {
    console.log(`[${new Date().toISOString()}] Token expiring soon — refreshing...`);
    return await refreshAccessToken(data.refresh_token);
  }

  return data.access_token;
}

/**
 * Exchanges the stored refresh token for a new access token.
 * Updates row id=1 in zoho_tokens with the new token and expiry.
 * Returns the new access token string.
 */
async function refreshAccessToken(refreshTokenOverride) {
  // If not passed directly, read from DB
  let refreshToken = refreshTokenOverride;

  if (!refreshToken) {
    const { data, error } = await supabase
      .from('zoho_tokens')
      .select('refresh_token')
      .eq('id', 1)
      .single();

    if (error || !data?.refresh_token) {
      throw new Error('No refresh token found in DB. Re-run OAuth setup.');
    }
    refreshToken = data.refresh_token;
  }

  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
    });

    const response = await axios.post(`${ACCOUNTS_URL}/token`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, error: zohoError } = response.data;

    if (!access_token) {
      throw new Error(`Zoho token refresh failed: ${zohoError || JSON.stringify(response.data)}`);
    }

    const newExpiresAt = Date.now() + TOKEN_LIFETIME_MS;

    const { error: dbError } = await supabase
      .from('zoho_tokens')
      .update({
        access_token,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (dbError) {
      throw new Error(`Failed to save refreshed token to DB: ${dbError.message}`);
    }

    console.log(`[${new Date().toISOString()}] Access token refreshed successfully.`);
    return access_token;
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error(`[${new Date().toISOString()}] refreshAccessToken error:`, msg);
    throw new Error(`Token refresh failed: ${msg}`);
  }
}

/**
 * Called once during initial OAuth setup (/oauth/callback).
 * Upserts row id=1 with the brand-new access + refresh tokens.
 */
async function saveInitialTokens(access_token, refresh_token) {
  const expires_at = Date.now() + TOKEN_LIFETIME_MS;

  const { error } = await supabase.from('zoho_tokens').upsert(
    {
      id: 1,
      access_token,
      refresh_token,
      expires_at,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw new Error(`Failed to save initial tokens: ${error.message}`);
  }

  console.log(`[${new Date().toISOString()}] Initial Zoho tokens saved to DB.`);
}

module.exports = { getAccessToken, refreshAccessToken, saveInitialTokens };
