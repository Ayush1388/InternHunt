# InternHunt

One place for **internships and fresher tech roles** (SDE, web/full-stack, data/ML) that are open to people in India — on-site in Indian cities, remote from India/APAC, or remote worldwide.

Instead of scraping sites like LinkedIn or Naukri (which ban it and break constantly), InternHunt reads **official public job APIs and feeds** — stable, allowed, and every job links to the real application page.

### Sources, by trust tier

**✓ Company careers pages** — read straight from the company's own hiring system, so a third party can't post a fake job there. Listed in `companies.json` or found by `npm run discover`.

| Source | Notes |
|---|---|
| Greenhouse, Lever, Ashby | Most tech companies and startups |
| Workable, Recruitee, Personio | More startups and mid-size companies |
| SmartRecruiters | Larger employers |
| Workday | Big MNCs with Indian offices (NVIDIA, Salesforce, Intel, Adobe, Mastercard to start). Uses the JSON behind their own careers page — unofficial, early-career searches only |
| amazon.jobs | Amazon's own careers site — India roles only |
| Microsoft Careers | Microsoft's own careers site — India roles only |

**Job boards** — employers pay to post or the board curates listings. Stricter filters apply (max 30 days old, must have a posting date).

| Source | Why it's kept |
|---|---|
| We Work Remotely | Employers pay ~$299 per post, which keeps out spam and agency blasts. Main complaint: "anywhere" jobs that are really US-only — the region filter catches those |
| Remote OK | Employer-paid posts; reviewers and Reddit users report real companies. No active curation, so the scam filter matters here |
| Remotive | Curated remote tech jobs; some stale posts reported (30-day cap handles that) |
| Working Nomads | Curated, says every post is vetted |
| The Muse | Big-company employer partners; tags Internship / Entry Level |

**HN community posts** — "Who is hiring?" posts by people at the company. Real companies, but unverified and some users report ghost listings, so a post must link to a company website and pass every filter.

### Removed after a trust review

| Source | Why it was dropped |
|---|---|
| Careerjet | Scrapes the open web; reviews describe fake offers, upfront-payment requests and WhatsApp task scams |
| Adzuna | Scrapes the open web; reviews describe expired "ghost" jobs, dead links and low-quality agency ads |
| Jobicy | Re-publishes jobs gathered from dozens of other boards, so the original poster can't be verified |
| Himalayas | Free employer posting plus automated imports with light vetting |
| Arbeitnow | Europe-only; produced no jobs open to India |

**Never included:** LinkedIn, Naukri, Internshala, Unstop, Wellfound, Indeed, Cutshort, Instahyre — no public jobs API and their terms forbid scraping. Keep their email alerts on alongside InternHunt.

## Coverage: which companies are included

**Built-in list of 900+ companies** hiring in India (`server/src/config/india-companies.json`), grouped as:
fintech & banks (Razorpay, PhonePe, CRED, Groww, Zerodha, Angel One, KreditBee, HDFC Bank, NPCI…), consumer & quick commerce (Swiggy, Zomato, Zepto, Meesho, Flipkart, BigBasket, boAt, Pocket FM…), mobility & logistics (Porter, Ather, Rivigo, Shadowfax, ixigo…), edtech, healthtech, SaaS & dev tools (Freshworks, Postman, BrowserStack, Keka, Sprinto, Appsmith, SigNoz…), AI & data (Sarvam, Quantiphi, Tredence, Fractal…), gaming, semiconductors & deep tech (Qualcomm, MediaTek, Micron, NXP, Skyroot, Pixxel…), global tech centres in India (Google, Adobe, Salesforce, Cisco, Walmart, Target, Lowe's, Tesco…), bank & finance tech centres (Goldman Sachs, JPMorgan, Morgan Stanley, Barclays, Wells Fargo…), quant firms (Tower, Graviton, Quadeye, AlphaGrep…) and IT services (TCS, Infosys, Wipro, HCL, LTIMindtree, Mphasis, Persistent…). Plus every YC company with an Indian presence.

**Automatic discovery, weekly.** The server opens each company's careers page (or guesses it from the company's website), finds the hiring system behind it (Greenhouse, Lever, Ashby, Workable, Recruitee, Personio, SmartRecruiters, Workday), and starts reading its jobs. If the page doesn't reveal it, it tries the company name on each system. The first run starts a minute after you launch the server and takes roughly 10–20 minutes for 900+ companies; run it by hand any time with `npm run discover`. Guesses by name are double-checked (short or generic names are skipped, and Greenhouse boards must carry a matching company name).

**Companies it can't read automatically** (their own custom careers sites with no public feed — e.g. Google, Flipkart, Zoho) are listed in **Programs & drives → Careers pages to check directly**, so nothing is silently missing.

**Add any company:** `npm run discover -- --names "Company A, Company B"` or paste a careers URL: `npm run discover -- --names "https://company.com/careers"`.

## Programs & drives tab

Many opportunities aren't posted as normal jobs. This tab tracks **41 official program pages**, re-read daily, showing any deadline found on the page, whether it says open/closed, and when it last changed:

- **Open source:** Google Summer of Code, LFX Mentorship (with a **live list of LFX projects accepting applications right now**), Outreachy, MLH Fellowship, Summer of Bitcoin, Code for GovTech (C4GT), GirlScript Summer of Code, Season of KDE, Google Season of Docs, FOSSEE Summer Fellowship, European Summer of Code, Igalia Coding Experience, OSRE, Hacktoberfest
- **Government:** AICTE National Internship Portal, PM Internship Scheme, MeitY Digital India Internship, MeitY Work Based Learning Programme (C-DAC, CERT-In, NIELIT, STQC…), NITI Aayog, DRDO, ISRO, NICSI, FSSAI
- **Company programs:** Google STEP & India student roles, Explore Microsoft, Goldman Sachs Summer Analyst, JPMorgan Code for Good, Flipkart GRiD, Walmart Sparkathon, Samsung PRISM
- **Fresher drives:** TCS NQT, Infosys, Wipro Elite NTH, Cognizant GenC, Accenture
- **Research:** Microsoft Research India Research Fellow, IAS-INSA-NASI Summer Research Fellowship, IIT Kanpur SURGE, IIT Roorkee SPARK

Add more in `server/src/config/programs.json` — or just use **Add from link**.

## Add from link

Saw something on YouTube, LinkedIn or from a friend? Click **+ Add from link** and paste the **official** link:

- **A company careers page or job post** (e.g. `https://company.com/careers`, `jobs.lever.co/company/…`) → InternHunt finds the company's hiring system and tracks **all** its jobs from then on.
- **A program or announcement page** → it's added under *Programs → Added by you* and checked daily for deadlines and changes.
- **Telegram, WhatsApp, YouTube, LinkedIn, Naukri, Internshala, Unstop links are refused** — they aren't the original source. Open the post, find the company's or organiser's own page, and add that.

Every link you add makes the app more complete for next time.

**Why not Telegram/WhatsApp job channels or YouTube lists?** Those repost from the official pages above (so you get it here first-hand), and Telegram/WhatsApp "job groups" are the main channel for fee-based fake internships in India.

## How fake, scam and ghost jobs are kept out

Every posting from every source goes through `server/src/lib/trust.js` before it's saved. It's **dropped** if it:

- **Asks you for money** — registration / training / certificate / "refundable deposit" fees, "pay ₹…"
- **Recruits over WhatsApp or Telegram**, or asks you to email a **gmail/yahoo/outlook** address
- Uses **task-scam wording** — "earn ₹2000 per day", data-entry/typing/form-filling jobs, "guaranteed placement"
- **Asks for Aadhaar, PAN, bank details or OTP**, or pays in **crypto / gift cards**
- Is posted by an **agency "on behalf of our client"**, or by a "Confidential" / "Stealth" company
- Is an **evergreen "talent pool" / "general application"** posting that collects CVs without a real opening
- Says **remote but the description restricts it to the US / EU / UK** etc. and never mentions India or worldwide
- Is **too old**: 30 days for job boards, 40 for HN, 120 for company pages
- Is an HN post with no company website, or a job-board post with no date

Softer warning signs are **shown on the card** instead: open 45+ days (possible ghost job), reposted after closing, very short description.

**You teach it too:**
- **Report → Scam / Fake** hides that job and **blocks the company** for good (undo under Sources).
- **Report → Never heard back** marks it on your tracker and warns you on that company's other jobs.
- Applications with **no reply after 3 weeks** get a one-tap "Mark as no reply".
- **"Only from company careers pages"** in the filters shows just the ✓ tier.

The Sources panel shows how many postings each rule filtered out in the last refresh.

**No filter is perfect.** A real employer never asks you to pay, never interviews only over WhatsApp, and sends offers from a company email address. If something asks for money, report it.

## Quick start

Needs **Node.js 22.13 or newer** (uses Node's built-in SQLite, so there's nothing to compile). Check with `node -v`.

```bash
npm run setup          # installs server + client
npm run build          # builds the React app
npm start              # serves everything on http://localhost:5000
```

On first start the server fetches every board (a few minutes), then refreshes every 6 hours. You can also hit **Refresh now** in the app (limited to once per 10 minutes so boards aren't hammered).

**Want to see the UI before fetching anything?** Run `npm run seed:sample` to load a few fictional postings. Remove them later with `npm run seed:sample -- --remove` (from `server/`).

### Development (hot reload)

```bash
npm run dev:server     # API on :5000, restarts on file changes
npm run dev:client     # React on :5173, proxies /api to :5000
```

## Features

- **Filters:** role (SDE / Web / Data-ML), level (Internship / Entry-level / Level not stated), where (India on-site, Remote India/APAC, Remote worldwide), city, keyword search across title, company, skills and description.
- **Smart filtering:** senior, manager, SDE-2+ and "3+ years" roles are dropped automatically; non-tech roles (sales, finance, HR…) are skipped; "Remote – US only" jobs are excluded.
- **De-duplication:** the same job on a company board and an aggregator shows once (the company link wins).
- **Application tracker:** Save jobs, mark Applied (the app asks after you click Apply), move them through Interviewing / Offer / Rejected, and keep notes.
- **Closed jobs:** postings that vanish from a board are marked "No longer listed" instead of silently disappearing from your tracker.
- **Sources panel:** shows which boards fetched OK and which failed (e.g. a wrong token).

## Design

The frontend uses **React + Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com)** components (Radix primitives, lucide icons, Geist font), in a monochrome **graphite** theme with a light/dark/system toggle.

- **⌘K / Ctrl+K** — command menu: search roles live, jump between pages, apply filter presets, switch theme
- **/** — focus search · **g b / g a / g p** — go to Browse / Applications / Programs
- Click any role for the detail panel; Apply opens the company page and asks whether you applied
- **Applications** has a weekly goal ring, a daily streak and response-rate stats

The shadcn components live in `client/src/components/ui/`. `client/components.json` is set up, so on your machine you can add more with `npx shadcn@latest add <component>`. Theme colours are CSS variables at the top of `client/src/index.css`.

## Finding more companies automatically

```bash
cd server
npm run discover                                   # YC companies in India or hiring remote
npm run discover -- --names "Razorpay, Swiggy, Zomato, PhonePe, Freshworks"
npm run discover -- --file my-companies.txt        # one name per line (optionally "name; website")
npm run discover -- --yc-all                       # every active YC company (slow)
```

It tries each company's likely board name on Ashby, Greenhouse, Lever, Workable and Recruitee and saves hits to `src/config/discovered.json`, which is merged into every refresh. Matching is by name, so glance at the list — a common name can occasionally match a different company's board.

## Adding companies by hand

Edit `server/src/config/companies.json`. Find a company's careers page and look at its URL:

| Careers URL looks like | Add under | Token |
|---|---|---|
| `boards.greenhouse.io/postman` or `job-boards.greenhouse.io/postman` | `greenhouse` | `postman` |
| `jobs.lever.co/cred` | `lever` | `cred` |
| `jobs.ashbyhq.com/sarvam` | `ashby` | `sarvam` |
| `apply.workable.com/acme` | `workable` | `acme` |
| `acme.recruitee.com` | `recruitee` | `acme` |
| `acme.jobs.personio.de` | `personio` | `acme` (add `"domain": "com"` for `.personio.com`) |
| `jobs.smartrecruiters.com/SomeCompany` | `smartrecruiters` | `SomeCompany` |
| `nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite` | `workday` | `{"host": "nvidia.wd5.myworkdayjobs.com", "tenant": "nvidia", "site": "NVIDIAExternalCareerSite"}` |

Then hit Refresh. A wrong token shows as "Board not found (404)" in the Sources panel. The starter list has 19 companies verified to hire in India; adding 50–100 more is the single biggest improvement you can make.

## How it works

```
companies.json ─┐
                ├─> sources/*.js  (fetch + convert each API to one shape)
aggregator APIs ┘        │
                         v
                lib/classify.js   (role? level? open to India?) ──> dropped if not relevant
                         │
                         v
                ingest.js  (dedupe, upsert, mark missing jobs closed) ──> SQLite (server/data/)
                         │
                         v
                index.js   Express API  ──>  React app (client/)
```

- `server/src/lib/classify.js` — all the rules. Tweak regexes here if something is wrongly kept or dropped.
- `server/test/` — `npm test` runs classifier and ingestion tests against sample data in each API's real format.

### API

| Endpoint | Purpose |
|---|---|
| `GET /api/jobs?q=&category=sde,web&level=intern&loc=india_onsite&city=Pune&page=1` | Search jobs |
| `GET /api/jobs/:id` | One job with full description |
| `PUT /api/jobs/:id/track` `{status, notes}` | Save / applied / interview / offer / rejected |
| `DELETE /api/jobs/:id/track` | Stop tracking |
| `GET /api/meta` | Counts, sources status, last refresh |
| `POST /api/refresh` | Fetch everything now |

## Ideas for next steps

- Email or Telegram alerts for new matches (run after each refresh)
- Resume keyword matching to rank jobs by fit
- Deploy: Render / Railway free tier (set `DATA_DIR` to a persistent disk)

## Respecting the sources

Remotive, Remote OK and We Work Remotely ask for credit and a link back — every card names its source, links to the board's job page, and the footer credits them. Each feed has a minimum gap between fetches, which the refresh enforces even if you press "Refresh now" repeatedly. Keep InternHunt as a personal tool rather than republishing listings publicly.

## Deploying to Vercel

The repo is ready to import into Vercel as-is (`vercel.json` holds the settings):

- The React app is built from `client/` and served as static files.
- The Express API runs as one serverless function (`api/index.js`), reached at `/api/*`.
- Data is stored in a hosted [Turso](https://turso.tech) database (SQLite in the cloud, free tier), so
  your tracker, reports and jobs survive restarts and redeploys.
- Jobs are refreshed when a request finds them older than `REFRESH_HOURS`, and by a daily Vercel Cron
  on `/api/cron/refresh`.

Steps:

1. Create a Turso database (web dashboard at turso.tech, or the CLI:
   `turso db create internhunt`, `turso db show internhunt --url`, `turso db tokens create internhunt`).
2. In Vercel: **Add New → Project**, import this repo, keep the root directory as `/`.
3. Add environment variables `TURSO_DATABASE_URL` (the `libsql://…` URL), `TURSO_AUTH_TOKEN`, and
   optionally `CRON_SECRET` (any random string), then deploy.

Without the Turso variables the app still runs on Vercel, but its data lives in `/tmp` and is lost
whenever Vercel starts a new instance.
