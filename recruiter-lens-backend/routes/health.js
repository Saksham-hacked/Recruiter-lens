const express = require('express');
const axios = require('axios');
const { getAccessToken } = require('../services/tokenManager');

const router = express.Router();

/**
 * GET /health
 * Not protected by API key — safe to hit in browser.
 * Checks token validity and Zoho connectivity.
 */
router.get('/', async (req, res) => {
  const timestamp = new Date().toISOString();

  try {
    const token = await getAccessToken();

    await axios.get(`${process.env.ZOHO_BASE_URL}/settings/modules`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    return res.json({
      status: 'ok',
      zohoConnected: true,
      timestamp,
    });
  } catch (err) {
    return res.json({
      status: 'error',
      zohoConnected: false,
      error: err.message,
      timestamp,
    });
  }
});

module.exports = router;
