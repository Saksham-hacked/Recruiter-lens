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
  const { email, phone, linkedinUrl, firstName, lastName, currentEmployer } = req.body;

  const hasPrimaryIdentifier = !!(email || phone || linkedinUrl);
  const hasFallbackIdentifier = !!(firstName && lastName);

  // Validate: at least one primary identifier, OR a first+last name fallback
  // (used by platforms like Indeed Smart Sourcing that don't expose
  // email/phone/linkedinUrl on the search results view).
  if (!hasPrimaryIdentifier && !hasFallbackIdentifier) {
    return res.status(400).json({
      error: 'At least one of email, phone, or linkedinUrl is required.',
    });
  }

  try {
    const result = await searchCandidate({ email, phone, linkedinUrl, firstName, lastName, currentEmployer });
    return res.json(result);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] /lookup error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
