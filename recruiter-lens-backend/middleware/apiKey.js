/**
 * API Key middleware — the only security layer for this internal tool.
 * Reads X-API-Key header and compares it to API_KEY in .env.
 * Returns 401 JSON if it doesn't match.
 */
function apiKeyMiddleware(req, res, next) {
  const provided = req.headers['x-api-key'];
  const expected = process.env.API_KEY;

  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

module.exports = apiKeyMiddleware;
