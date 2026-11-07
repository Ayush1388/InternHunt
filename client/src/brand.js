// The name and the few brand values the whole site shares. Rename here.
export const BRAND = 'Knockd';
export const TAGLINE = 'Knock on the right startup’s door';

/** Telegram bot link. The username comes from the server (/api/config); this is only the fallback. */
export const telegramUrl = (bot) => (bot ? `https://t.me/${bot}` : null);

let configPromise = null;
/** Server features (telegram bot name, gmail, ai), fetched once per page load. */
export function siteConfig() {
  configPromise ||= fetch('/api/config')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return configPromise;
}
