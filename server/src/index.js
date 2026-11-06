// Local server: the API plus the built web app (client/dist) when it exists.
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';
import { config, BRAND } from './config.js';
import { ON_VERCEL } from './runtime.js';
import { refreshAll } from './pipeline/refresh.js';
import { runDigest } from './telegram/bot.js';
import { runFollowups, processQueue } from './drafts/service.js';
import { getMeta } from './db/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', '..', 'client', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

if (!ON_VERCEL) {
  app.listen(config.port, () => {
    console.log(`${BRAND} API on http://localhost:${config.port}`);
    if (process.env.DISABLE_AUTO_REFRESH === '1') return;
    // Locally there's no Vercel cron: refresh on start if stale, then every 12 hours; queue every minute.
    const daily = async () => {
      await refreshAll().catch((e) => console.error('[refresh]', e));
      await runDigest().catch((e) => console.error('[digest]', e));
      await runFollowups().catch((e) => console.error('[followups]', e));
    };
    getMeta('last_refresh').then((last) => {
      if (!last || Date.now() - Date.parse(last) > 12 * 3600_000) daily();
    });
    setInterval(daily, 12 * 3600_000);
    setInterval(() => processQueue({ budgetMs: 50_000 }).catch(() => {}), 60_000);
  });
}

export default app;
