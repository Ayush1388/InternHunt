-- Doorstep database (Postgres + pgvector). Safe to run on every start: everything is IF NOT EXISTS.
-- Tables follow the plan: companies, jobs, contacts, users, drafts, sends (+ the bits around them).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS meta (k text PRIMARY KEY, v text);

-- A company we know about, from any source (ATS board, YC directory, funding news, a saved link).
CREATE TABLE IF NOT EXISTS companies (
  id serial PRIMARY KEY,
  key text UNIQUE NOT NULL,              -- normalised name, see lib/names.js
  name text NOT NULL,
  domain text,
  website text,
  one_liner text,
  description text,
  industry text,
  team_size int,
  location text,
  logo_url text,
  backed text NOT NULL DEFAULT '',       -- '', 'yc', 'techstars', 'yc,techstars'
  yc_batch text,
  yc_slug text UNIQUE,
  linkedin text,
  twitter text,
  hiring boolean NOT NULL DEFAULT false,
  site_emails jsonb NOT NULL DEFAULT '[]',
  contacts_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS companies_domain ON companies (domain);

-- Something worth mentioning in an email: a funding round, a launch, a new YC batch.
CREATE TABLE IF NOT EXISTS signals (
  id serial PRIMARY KEY,
  company_id int NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  kind text NOT NULL,                    -- funding | launch | yc
  title text NOT NULL,
  summary text,
  amount text,
  round text,
  url text NOT NULL,
  source text NOT NULL,                  -- entrackr | inc42 | startuptalky | yc
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, url)
);
CREATE INDEX IF NOT EXISTS signals_recent ON signals (published_at DESC);

-- Public job boards we read (Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters, YC).
CREATE TABLE IF NOT EXISTS boards (
  key text PRIMARY KEY,                  -- ats:token
  ats text NOT NULL,
  token text NOT NULL,
  company_id int REFERENCES companies (id) ON DELETE SET NULL,
  label text NOT NULL,
  how text NOT NULL DEFAULT 'manual',    -- manual | careers page | name match | yc | link
  ok boolean,
  error text,
  fetched int,
  kept int,
  blocked int,
  last_run timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS boards_due ON boards (last_run NULLS FIRST);

-- Companies we've already looked for a job board for, so discovery moves on.
CREATE TABLE IF NOT EXISTS discovery (
  company_key text PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  result text
);

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,                   -- source:external id
  source text NOT NULL,
  board_key text,
  company_id int REFERENCES companies (id) ON DELETE CASCADE,
  company text NOT NULL,
  company_key text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  description text NOT NULL DEFAULT '',
  locations text NOT NULL DEFAULT '',
  loc_tag text NOT NULL,
  city text,
  category text NOT NULL,
  level text NOT NULL,                   -- intern | job
  exp int NOT NULL DEFAULT 0,
  min_years int,
  languages jsonb NOT NULL DEFAULT '[]',
  tags jsonb NOT NULL DEFAULT '[]',
  flags jsonb NOT NULL DEFAULT '[]',
  employment_type text,
  salary text,
  deadline date,
  trust text NOT NULL DEFAULT 'company',
  backed text NOT NULL DEFAULT '',
  yc_batch text,
  dedup_key text NOT NULL,
  reposts int NOT NULL DEFAULT 0,
  posted_at timestamptz,
  first_seen timestamptz NOT NULL DEFAULT now(),   -- "seen job" tracking: new roles = first_seen after the last digest
  last_seen timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  closed_at timestamptz,
  embedding vector(768),
  embedded_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_open ON jobs (is_active, first_seen DESC);
CREATE INDEX IF NOT EXISTS jobs_company ON jobs (company_key);
CREATE INDEX IF NOT EXISTS jobs_dedup ON jobs (dedup_key);
CREATE INDEX IF NOT EXISTS jobs_board ON jobs (board_key);
CREATE INDEX IF NOT EXISTS jobs_embedding ON jobs USING hnsw (embedding vector_cosine_ops);

-- People at a company. Every row says where it came from (source + source_url), as the privacy plan requires.
CREATE TABLE IF NOT EXISTS contacts (
  id serial PRIMARY KEY,
  company_id int NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  email text,
  email_status text NOT NULL DEFAULT 'none', -- verified | unverified | on_site | guess | none
  guesses jsonb NOT NULL DEFAULT '[]',
  linkedin text,
  twitter text,
  source text NOT NULL,                  -- yc_page | company_site | apify | user
  source_url text NOT NULL,
  found_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  google_sub text UNIQUE,
  email text,
  name text,
  picture text,
  telegram_chat_id text UNIQUE,
  telegram_username text,
  tg_link_code text UNIQUE,
  tg_link_expires timestamptz,
  gmail_email text,
  gmail_token text,                      -- refresh token, encrypted (lib/secrets.js)
  profile jsonb NOT NULL DEFAULT '{}',   -- skills, roles, links, proof points. Never the resume itself.
  embedding vector(768),
  embedded_at timestamptz,
  daily_cap int NOT NULL DEFAULT 15,
  paused boolean NOT NULL DEFAULT false,
  digest boolean NOT NULL DEFAULT true,
  style jsonb NOT NULL DEFAULT '{}',
  last_digest_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- The pipeline: saved -> drafted -> applied (sent) -> replied -> interview -> offer, or rejected / no_reply.
CREATE TABLE IF NOT EXISTS tracking (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  job_id text NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  status text NOT NULL,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS reports (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  job_id text NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  company_key text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id, reason)
);

CREATE TABLE IF NOT EXISTS blocked (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  company_key text NOT NULL,
  company text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_key)
);

-- An email written for one person to one founder. Nothing leaves without the person approving it.
CREATE TABLE IF NOT EXISTS drafts (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  job_id text REFERENCES jobs (id) ON DELETE SET NULL,
  company_id int REFERENCES companies (id) ON DELETE CASCADE,
  contact_id int REFERENCES contacts (id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'first',    -- first | followup
  parent_send_id int,
  to_name text,
  to_email text,
  email_status text,
  subject text NOT NULL,
  body text NOT NULL,
  original_body text NOT NULL,
  why text,
  facts jsonb NOT NULL DEFAULT '{}',
  checks jsonb NOT NULL DEFAULT '{}',
  model text,
  status text NOT NULL DEFAULT 'draft',  -- draft | queued | sent | gmail_draft | skipped | failed
  error text,
  gmail_draft_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drafts_user ON drafts (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS sends (
  id serial PRIMARY KEY,
  draft_id int NOT NULL REFERENCES drafts (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  company_id int REFERENCES companies (id) ON DELETE SET NULL,
  root_send_id int,                      -- first email of the thread (follow-ups point at it)
  to_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued | sent | failed
  error text,
  send_after timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  gmail_message_id text,
  gmail_thread_id text,
  rfc_message_id text,
  followups int NOT NULL DEFAULT 0,
  next_followup_at timestamptz,
  replied_at timestamptz,
  stopped boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS sends_queue ON sends (status, send_after);

-- Before/after pairs from the person's own edits: the "my writing style" profile is built from these.
CREATE TABLE IF NOT EXISTS style_samples (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  before text NOT NULL,
  after text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Roles already shown in someone's daily digest, so each morning only has new ones.
CREATE TABLE IF NOT EXISTS digest_items (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  job_id text NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  action text,
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS bot_state (
  chat_id text PRIMARY KEY,
  state text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waitlist (
  email text NOT NULL,
  kind text NOT NULL,                    -- pro | recruiting
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, kind)
);

-- Day-one metrics: activation, drafts approved, emails sent, replies.
CREATE TABLE IF NOT EXISTS events (
  id serial PRIMARY KEY,
  user_id text REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_kind ON events (kind, created_at DESC);

-- Gmail tracking: what a scan of the inbox headers (sender + subject only) found for each role.
ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_scanned_at timestamptz;
CREATE TABLE IF NOT EXISTS mail_events (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message_id text NOT NULL,
  job_id text REFERENCES jobs (id) ON DELETE CASCADE,
  status text,
  from_addr text,
  subject text,
  at timestamptz NOT NULL,
  PRIMARY KEY (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS mail_events_job ON mail_events (user_id, job_id, at DESC);
