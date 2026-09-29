// Vercel serverless entry: every /api/* request is routed here (see vercel.json) and handled by the Express app.
// If the server fails to start, answer with the reason instead of a bare 500 so it shows up in the app.
let app;
let startError;
try {
  app = (await import('../server/src/index.js')).default;
} catch (err) {
  startError = err;
  console.error('[startup] server failed to load', err);
}

export default function handler(req, res) {
  if (app) return app(req, res);
  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: `Server failed to start: ${startError?.message || startError}` }));
}
