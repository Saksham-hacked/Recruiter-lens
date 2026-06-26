const cron = require('node-cron');
const { refreshAccessToken } = require('../services/tokenManager');

/**
 * Proactively refreshes the Zoho access token every 45 minutes.
 * Zoho tokens expire after 1 hour; this keeps things fresh well ahead of that.
 * Errors are logged but never crash the server.
 */
function startTokenRefreshJob() {
  cron.schedule('*/45 * * * *', async () => {
    try {
      await refreshAccessToken();
      console.log(`[${new Date().toISOString()}] [cron] Token refreshed successfully.`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [cron] Token refresh failed:`, err.message);
    }
  });

  console.log(`[${new Date().toISOString()}] Token refresh cron job started (every 45 min).`);
}

module.exports = { startTokenRefreshJob };
