const express = require('express');
const supabase = require('../db/supabase');

const router = express.Router();

/**
 * GET /logs
 * Query API logs with optional filters. Protected by API key (applied in index.js).
 *
 * Query params:
 *   path     — filter by exact path (e.g. /lookup, /candidate/add)
 *   method   — filter by HTTP method (GET, POST, etc.)
 *   status   — filter by exact status code (e.g. 200, 401, 500)
 *   from     — ISO datetime, logs on or after this timestamp
 *   to       — ISO datetime, logs on or before this timestamp
 *   limit    — max rows to return (default 50, max 200)
 *   offset   — pagination offset (default 0)
 *   sort     — 'asc' or 'desc' by requested_at (default desc)
 *   errors   — if 'true', only return status >= 400
 *
 * Response: { total, limit, offset, logs: [...] }
 */
router.get('/', async (req, res) => {
  try {
    const {
      path: pathFilter,
      method,
      status,
      from,
      to,
      limit: limitParam,
      offset: offsetParam,
      sort,
      errors,
    } = req.query;

    const limit = Math.min(parseInt(limitParam, 10) || 50, 200);
    const offset = parseInt(offsetParam, 10) || 0;
    const ascending = sort === 'asc';

    // Build query
    let query = supabase
      .from('api_logs')
      .select('*', { count: 'exact' })
      .order('requested_at', { ascending })
      .range(offset, offset + limit - 1);

    if (pathFilter) {
      query = query.eq('path', pathFilter);
    }

    if (method) {
      query = query.eq('method', method.toUpperCase());
    }

    if (status) {
      query = query.eq('status_code', parseInt(status, 10));
    }

    if (from) {
      query = query.gte('requested_at', from);
    }

    if (to) {
      query = query.lte('requested_at', to);
    }

    if (errors === 'true') {
      query = query.gte('status_code', 400);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error(`[${new Date().toISOString()}] /logs query error:`, error.message);
      return res.status(500).json({ error: `Failed to fetch logs: ${error.message}` });
    }

    // Parse JSON strings back into objects for cleaner response
    const logs = (data || []).map((row) => ({
      ...row,
      request_body: row.request_body ? tryParse(row.request_body) : null,
      response_body: row.response_body ? tryParse(row.response_body) : null,
    }));

    return res.json({
      total: count,
      limit,
      offset,
      logs,
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] /logs error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /logs/stats
 * Quick summary: total requests, error count, avg duration, top endpoints.
 */
router.get('/stats', async (req, res) => {
  try {
    const { from, to } = req.query;

    let query = supabase.from('api_logs').select('path, method, status_code, duration_ms, requested_at');

    if (from) query = query.gte('requested_at', from);
    if (to) query = query.lte('requested_at', to);

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: `Stats query failed: ${error.message}` });
    }

    const rows = data || [];
    const totalRequests = rows.length;
    const errorCount = rows.filter((r) => r.status_code >= 400).length;
    const avgDuration = totalRequests > 0
      ? Math.round(rows.reduce((sum, r) => sum + (r.duration_ms || 0), 0) / totalRequests)
      : 0;

    // Top endpoints by hit count
    const endpointCounts = {};
    rows.forEach((r) => {
      const key = `${r.method} ${r.path}`;
      endpointCounts[key] = (endpointCounts[key] || 0) + 1;
    });

    const topEndpoints = Object.entries(endpointCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([endpoint, count]) => ({ endpoint, count }));

    // Status code breakdown
    const statusBreakdown = {};
    rows.forEach((r) => {
      const bucket = `${Math.floor(r.status_code / 100)}xx`;
      statusBreakdown[bucket] = (statusBreakdown[bucket] || 0) + 1;
    });

    return res.json({
      totalRequests,
      errorCount,
      errorRate: totalRequests > 0 ? `${((errorCount / totalRequests) * 100).toFixed(1)}%` : '0%',
      avgDurationMs: avgDuration,
      topEndpoints,
      statusBreakdown,
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] /logs/stats error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /logs/clear
 * Purge logs older than N days (default 30). Pass ?days=7 to clear older than 7 days.
 */
router.delete('/clear', async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { error, count } = await supabase
      .from('api_logs')
      .delete({ count: 'exact' })
      .lt('requested_at', cutoff);

    if (error) {
      return res.status(500).json({ error: `Clear failed: ${error.message}` });
    }

    return res.json({
      message: `Cleared ${count} logs older than ${days} days.`,
      cutoff,
      deletedCount: count,
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] /logs/clear error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

function tryParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

module.exports = router;
