// Every setting the server reads, in one place. Features switch on when their keys are present.
import './env.js';

const env = process.env;

export const BRAND = 'Knockd';
export const PUBLIC_URL = (env.PUBLIC_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:5199')).replace(/\/$/, '');

export const config = {
  port: Number(env.PORT || 5000),
  cronSecret: env.CRON_SECRET || '',
  appSecret: env.APP_SECRET || '',

  google: {
    clientId: env.GOOGLE_CLIENT_ID || '',
    clientSecret: env.GOOGLE_CLIENT_SECRET || '', // only needed for Gmail
  },
  gemini: {
    key: env.GEMINI_API_KEY || '',
    model: env.GEMINI_MODEL || 'gemini-flash-latest',
    embedModel: env.GEMINI_EMBED_MODEL || 'gemini-embedding-001',
  },
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN || '',
    username: (env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, ''),
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET || '',
  },
  apify: {
    token: env.APIFY_TOKEN || '',
    actor: env.APIFY_EMAIL_ACTOR || 'snipercoder~email-finder-by-name-and-domain',
    maxChargeUsd: Number(env.APIFY_MAX_CHARGE_USD || 0.5),
  },
  sending: {
    defaultCap: Number(env.DAILY_SEND_CAP || 15),
    maxCap: 20,
    followupDays: [4, 9, 16], // up to three follow-ups, same thread, stopped by a reply
  },
  refresh: {
    budgetMs: Number(env.REFRESH_BUDGET_MS || 200_000),
    boardsPerRun: Number(env.BOARDS_PER_RUN || 400),
    ycPagesPerRun: Number(env.YC_PAGES_PER_RUN || 150),
    discoverPerRun: Number(env.DISCOVER_PER_RUN || 60),
    embedPerRun: Number(env.EMBED_PER_RUN || 1500),
  },
};

export const features = () => ({
  googleSignIn: Boolean(config.google.clientId),
  gmail: Boolean(config.google.clientId && config.google.clientSecret),
  ai: Boolean(config.gemini.key),
  telegram: Boolean(config.telegram.token),
  telegramBot: config.telegram.username || null,
  verify: Boolean(config.apify.token),
});
