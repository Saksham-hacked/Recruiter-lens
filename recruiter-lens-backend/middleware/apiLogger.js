/**
 * Terminal API logger middleware.
 * Logs method, path, status code, and duration to the console for every request.
 */
function apiLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
    const reset = '\x1b[0m';

    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl || req.url} ${color}${status}${reset} ${duration}ms`
    );
  });

  next();
}

module.exports = apiLogger;
