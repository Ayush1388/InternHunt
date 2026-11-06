// Telegram Bot API. Bots can message people for free; limits are about one message a second per chat
// and about 30 a second overall, so sends are spaced and 429s are retried after `retry_after`.
import { config } from '../config.js';
import { sha256 } from '../lib/secrets.js';

export const tgEnabled = () => Boolean(config.telegram.token);
const base = () => `https://api.telegram.org/bot${config.telegram.token}`;

/** The secret Telegram echoes in X-Telegram-Bot-Api-Secret-Token, so only Telegram can call the webhook. */
export const webhookSecret = () => config.telegram.webhookSecret || sha256(`tg-webhook:${config.telegram.token}`).slice(0, 48);

let lastSend = 0;
export async function tg(method, body = {}, { retries = 2 } = {}) {
  if (!tgEnabled()) throw new Error('Telegram is not configured (TELEGRAM_BOT_TOKEN)');
  if (/^(send|edit)/.test(method)) {
    const gap = 40 - (Date.now() - lastSend); // ~25/s overall at most
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    lastSend = Date.now();
  }
  const res = await fetch(`${base()}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (json.ok) return json.result;
  if (res.status === 429 && retries > 0) {
    await new Promise((r) => setTimeout(r, ((json.parameters?.retry_after || 1) + 0.2) * 1000));
    return tg(method, body, { retries: retries - 1 });
  }
  // Editing a message to the same text isn't an error worth failing on.
  if (/message is not modified/i.test(json.description || '')) return null;
  throw Object.assign(new Error(`Telegram ${method}: ${json.description || res.status}`), { status: res.status, description: json.description });
}

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function send(chatId, text, { buttons, reply = false } = {}) {
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : reply ? { reply_markup: { force_reply: true, input_field_placeholder: 'Type here…' } } : {}),
  });
}

export function edit(chatId, messageId, text, { buttons } = {}) {
  return tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : { reply_markup: { inline_keyboard: [] } }),
  });
}

export const answer = (id, text = '', alert = false) => tg('answerCallbackQuery', { callback_query_id: id, text, show_alert: alert }).catch(() => {});

export async function downloadFile(fileId) {
  const f = await tg('getFile', { file_id: fileId });
  if (!f?.file_path) throw new Error('Couldn’t get that file from Telegram');
  const res = await fetch(`https://api.telegram.org/file/bot${config.telegram.token}/${f.file_path}`);
  if (!res.ok) throw new Error('Couldn’t download that file');
  return Buffer.from(await res.arrayBuffer());
}

let me = null;
export async function botUsername() {
  if (config.telegram.username) return config.telegram.username;
  if (!tgEnabled()) return null;
  if (!me) me = await tg('getMe').catch(() => null);
  return me?.username || null;
}

export const COMMANDS = [
  { command: 'today', description: 'Today’s startups for you' },
  { command: 'drafts', description: 'Emails waiting for your OK' },
  { command: 'profile', description: 'What I know about you' },
  { command: 'settings', description: 'Daily limit, pause, Gmail' },
  { command: 'privacy', description: 'What I store and why' },
  { command: 'delete', description: 'Delete all my data' },
  { command: 'help', description: 'How this works' },
];

export async function setupWebhook(url) {
  await tg('setWebhook', { url, secret_token: webhookSecret(), allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });
  await tg('setMyCommands', { commands: COMMANDS });
  await tg('setMyDescription', { description: 'Every morning: startups that just raised or are hiring, matched to you, with a short email to the founder. You approve every email. Nothing is sent without you.' }).catch(() => {});
  await tg('setMyShortDescription', { short_description: 'Startup internships and jobs, with emails you approve.' }).catch(() => {});
  return tg('getWebhookInfo');
}
