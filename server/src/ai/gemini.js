// Gemini over plain REST. Use a paid-tier key for real users: the free tier may use prompts to improve
// Google's products, and resumes are personal data.
import { config } from '../config.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const EMBED_DIM = 768;

export const aiEnabled = () => Boolean(config.gemini.key);

async function call(path, body, { timeoutMs = 45000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.key },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${json?.error?.message || 'request failed'}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** One JSON answer from the model. `schema` is an OpenAPI-style response schema. */
export async function generateJson({ system, prompt, schema, temperature = 0.7, model = config.gemini.model }) {
  if (!aiEnabled()) throw new Error('AI is not configured (GEMINI_API_KEY)');
  const out = await call(`models/${model}:generateContent`, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, responseMimeType: 'application/json', ...(schema ? { responseSchema: schema } : {}) },
  });
  const text = (out?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  try {
    return { data: JSON.parse(text), model, usage: out?.usageMetadata || null };
  } catch {
    throw new Error('Gemini returned something that isn’t JSON');
  }
}

/** Embeddings for up to 100 texts per call. task: RETRIEVAL_DOCUMENT (jobs) or RETRIEVAL_QUERY (people). */
export async function embed(texts, task = 'RETRIEVAL_DOCUMENT') {
  if (!aiEnabled()) throw new Error('AI is not configured (GEMINI_API_KEY)');
  const model = config.gemini.embedModel;
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const chunk = texts.slice(i, i + 100);
    const res = await call(`models/${model}:batchEmbedContents`, {
      requests: chunk.map((t) => ({ model: `models/${model}`, content: { parts: [{ text: String(t).slice(0, 6000) }] }, taskType: task, outputDimensionality: EMBED_DIM })),
    });
    for (const e of res.embeddings || []) out.push(normalise(e.values || []));
  }
  return out;
}

// Truncated Gemini embeddings aren't unit length; normalise so cosine distances compare fairly.
function normalise(v) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}
