// One small async API over Postgres, whichever Postgres is available:
//   DATABASE_URL set  -> a real server (Neon, Supabase, RDS...) through `pg`. Needs the pgvector extension.
//   otherwise         -> PGlite, Postgres compiled to WebAssembly, in server/data/pg (or memory for tests).
// Both speak the same SQL, so the rest of the app never knows which one it got.
import { readFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ON_VERCEL } from '../runtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(path.join(here, 'schema.sql'), 'utf8');
const SCHEMA_REV = '1';

let driver = null; // { kind, query(sql, params), exec(sql), transaction(fn), close() }
let starting = null;

async function connect() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: pg } = await import('pg');
    // Counts come back as int8 strings by default; we cast to int in SQL where it matters.
    const pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL || (ON_VERCEL ? 3 : 10)),
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    });
    return {
      kind: 'postgres',
      query: async (sql, params) => (await pool.query(sql, params)).rows,
      exec: (sql) => pool.query(sql),
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const out = await fn(async (sql, params) => (await client.query(sql, params)).rows);
          await client.query('COMMIT');
          return out;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite/vector');
  let dataDir = process.env.PGLITE_DIR || (ON_VERCEL ? path.join(os.tmpdir(), 'doorstep-pg') : path.join(here, '..', '..', 'data', 'pg'));
  if (dataDir !== 'memory://') mkdirSync(dataDir, { recursive: true });
  else dataDir = undefined;
  const pg = await PGlite.create({ ...(dataDir ? { dataDir } : {}), extensions: { vector } });
  return {
    kind: dataDir ? 'pglite' : 'pglite-memory',
    query: async (sql, params) => (await pg.query(sql, params)).rows,
    exec: (sql) => pg.exec(sql),
    transaction: (fn) => pg.transaction((tx) => fn(async (sql, params) => (await tx.query(sql, params)).rows)),
    close: () => pg.close(),
  };
}

/** Connects (once) and makes sure the schema exists. Every query goes through this. */
export function ready() {
  if (driver) return Promise.resolve(driver);
  if (!starting) {
    starting = (async () => {
      const d = await connect();
      const rows = await d.query("SELECT to_regclass('public.meta') AS t").catch(() => [{ t: null }]);
      let rev = null;
      if (rows[0]?.t) rev = (await d.query("SELECT v FROM meta WHERE k = 'schema_rev'"))[0]?.v ?? null;
      if (rev !== SCHEMA_REV) {
        await d.exec(SCHEMA);
        await d.query("INSERT INTO meta (k, v) VALUES ('schema_rev', $1) ON CONFLICT (k) DO UPDATE SET v = excluded.v", [SCHEMA_REV]);
      }
      driver = d;
      return d;
    })().catch((err) => {
      starting = null;
      throw err;
    });
  }
  return starting;
}

/** Rows for a query with $1, $2... parameters. */
export async function q(sql, params = []) {
  return (await ready()).query(sql, params);
}

/** First row, or null. */
export async function one(sql, params = []) {
  return (await q(sql, params))[0] ?? null;
}

/** Run fn(query) inside a transaction. */
export async function tx(fn) {
  return (await ready()).transaction(fn);
}

export async function dbKind() {
  return (await ready()).kind;
}

export async function closeDb() {
  if (driver) await driver.close();
  driver = null;
  starting = null;
}

export async function getMeta(k) {
  return (await one('SELECT v FROM meta WHERE k = $1', [k]))?.v ?? null;
}

export async function setMeta(k, v) {
  await q('INSERT INTO meta (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = excluded.v', [k, v == null ? null : String(v)]);
}

/** Builds parameter lists for dynamic SQL: p(value) returns "$n". */
export function params() {
  const values = [];
  const p = (v) => {
    values.push(v);
    return `$${values.length}`;
  };
  p.values = values;
  return p;
}

/** pgvector literal from a number array. */
export const vec = (arr) => (arr && arr.length ? `[${arr.map((x) => Number(x).toFixed(6)).join(',')}]` : null);

export const iso = (d) => (d == null ? null : d instanceof Date ? d.toISOString() : String(d));
