const express = require('express');
const { searchCandidate } = require('../services/zoho');

const router = express.Router();

/**
 * POST /lookup
 * Checks if a candidate exists in Zoho Recruit.
 *
 * Body: { email?, phone?, linkedinUrl?, platform }
 * Response: { found: true, candidate: {...} } | { found: false }
 */
router.post('/', async (req, res) => {
  const { email, phone, linkedinUrl } = req.body;

  // Validate: at least one identifier must be present
  if (!email && !phone && !linkedinUrl) {
    return res.status(400).json({
      error: 'At least one of email, phone, or linkedinUrl is required.',
    });
  }

  try {
    const result = await searchCandidate({ email, phone, linkedinUrl });
    return res.json(result);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] /lookup error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
