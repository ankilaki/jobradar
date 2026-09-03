# JobRadar — Project Design Document

**Purpose:** A personal job-board monitor that watches a curated list of companies' Ashby, Greenhouse, Lever, and (as a last resort) LinkedIn boards, writes new postings into Firestore, and lets a signed-in user filter, sort, track applications, and receive Discord alerts when a posting matches a saved filter.

**Audience:** Anyone (including a coding agent) working on this repo. This document describes **the system as it exists today**, not a pre-implementation spec. File paths, function names, data shapes, and schedules below match the current code.

**Status:** V1 is implemented and deployed. Latest product change (Aug 2026): exclude-keyword filters on Discord subscriptions, and location text on Discord alert lines.

Firebase project id: `jobradar-d8280`. Functions region: `us-central1`.

---

## 1. Product: shipped vs deferred

### Shipped (V1)

- Hourly scheduled sync of active companies on Ashby, Greenhouse, and Lever. LinkedIn companies are synced at most about once per day, spread across those hourly ticks.
- New/updated/closed postings upserted into a shared `jobs` collection. Logged-in clients see the feed update live via Firestore `onSnapshot` (no client polling).
- Single-user-oriented Firebase Auth (email/password, self-serve sign-up). Data access is gated to signed-in users; applied status and Discord subscriptions are per-uid.
- Job rows show title, description (excerpt + sanitized HTML expand), company, location, salary (when the source provides it), department / employment type / workplace type, apply link, relative “found by JobRadar” time, and an Applied toggle.
- Feed filters: keyword, city, state, country, remote-only, hide-applied. Sort: Newest or Most Relevant.
- Discord Incoming Webhook subscriptions: include keywords (OR), exclude keywords (OR), optional remote-only. Matching new jobs POST one consolidated message per subscription.
- Admin can add (single or bulk with ATS auto-detect), pause, and delete companies from the website via admin-only Cloud Functions. Sync status and errors are visible on `/admin/companies`.

### Explicitly deferred

- Email / SMS / WhatsApp / push (Discord is the only channel).
- Multi-user roles beyond signed-in vs admin — no teams, sharing, or per-user company lists.
- ATS platforms beyond Ashby, Greenhouse, Lever, and best-effort LinkedIn (e.g. Workday).
- Scraping LinkedIn via paid proxies/Apify — guest endpoints only; rate-limit fragility is accepted.
- Full-text search at scale (Algolia/Typesense) — client-side filter over a bounded Firestore query.
- Automated application submission.
- A Discord bot (slash commands, DMs, buttons). Incoming Webhooks only. Pause/delete happens in the JobRadar UI.
- Per-subscription location/company filters in the Alerts UI (the shared `JobFilter` type supports them; the form does not collect them yet).
- In-app edit of an existing company (pause/delete + add; no edit form).
- Auth lock-down to a single account (sign-up is still live).

### Latency (actual, not original target)

The original 5-minute poll / “visible within 10 minutes” target is **not** what shipped. Public ATS boards sync **every hour**. LinkedIn is ~daily. The login tagline still says “logged within minutes,” which describes the live Firestore listener, not the poll interval.

---

## 2. High-level architecture

```
                     ┌─────────────────────────────┐
                     │   Cloud Scheduler            │
                     │   every 1 hour                │
                     └──────────────┬───────────────┘
                                    │ triggers
                                    ▼
                     ┌───────────────────────────────────┐
                     │  Cloud Function (v2)               │
                     │  syncJobBoards                     │
                     │  1. load active companies             │
                     │  2. GH / Ashby / Lever: all of them │
                     │     this hour (capped concurrency) │
                     │  3. LinkedIn: due slice only       │
                     │  4. normalize + upsert jobs        │
                     │  5. mark disappeared jobs closed    │
                     │  6. match new jobs vs subscriptions  │
                     │  7. POST Discord webhooks           │
                     └──────────────┬─────────────────┬──┘
                                    │ writes             │ HTTP POST
                                    ▼                    ▼
                     ┌─────────────────────────┐   ┌────────────────────┐
                     │        Firestore         │   │  Discord Incoming    │
                     │  companies / jobs / users│   │  Webhook            │
                     └──────────────┬───────────┘   └────────────────────┘
                                    │ onSnapshot
                                    ▼
                     ┌─────────────────────────────────┐
                     │   React SPA (Firebase Hosting)  │
                     │   Auth, feed, applied, alerts,  │
                     │   admin (callable functions)   │
                     └─────────────────────────────────┘
```

**Why server-side polling:** it must run whether anyone has the site open, it fans out to all users via Firestore, and it avoids depending on ATS CORS.

**Why Discord is sent in the same invocation:** “new this run” and “who should be notified” stay in memory. Webhook URLs live on subscription docs, so the function has no Discord secret in config.

**Why company writes go through callables:** `companies` is client-read-only. Admin callables reuse the same fetch/detect logic as sync, including “test this board before saving.”

A second HTTPS function, `syncJobBoardsManual`, runs the same pipeline on demand (JSON summary). It is **unauthenticated** — treat as a test trigger, not a public API.

---

## 3. Tech stack (as shipped)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite 8 | `apps/web`, SPA on Firebase Hosting |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) | Signal Log tokens in `apps/web/src/index.css` |
| Auth | Firebase Authentication (Email/Password) | Sign-in + sign-up both live |
| Database | Cloud Firestore | Live listeners; rules in `firestore.rules` |
| Backend | Firebase Cloud Functions 2nd gen, Node 20, TypeScript | `functions/`, region `us-central1` |
| Scheduling | `onSchedule('every 1 hours')` | 540s timeout, 1GiB memory |
| Notifications | Discord Incoming Webhooks | Per-subscription URL in Firestore |
| Hosting | Firebase Hosting | `apps/web/dist`, SPA rewrite to `index.html` |
| Shared logic | `@jobradar/shared` workspace package | `matchesFilter`, location parser, filter option lists |
| Tests | Vitest | `packages/shared`, `functions`, `apps/web` |

**Cost:** Blaze is required for scheduled functions. At personal scale, Firebase usage typically stays inside free-tier quotas. Discord Incoming Webhooks are free (see §11.4).

---

## 4. Repository layout

npm workspaces (`package.json` at repo root):

```
apps/web              React SPA
functions             Cloud Functions (sync, notify, admin)
packages/shared       Pure filter + location helpers
scripts/              seed-companies.ts, set-admin-claim.ts, predeploy pack
firestore.rules
firestore.indexes.json
firebase.json
```

**Functions packaging:** Cloud Build cannot resolve the workspace package. Predeploy (`scripts/functions-predeploy.mjs`) builds shared, copies it to `functions/packed-shared`, `npm install`s in `functions/`, then `tsc`. `functions/package.json` depends on `"@jobradar/shared": "file:./packed-shared"`.

### Frontend source map

```
apps/web/src/
  App.tsx
  auth/           AuthContext, LoginPage, ProtectedRoute, AdminRoute
  lib/firebase.ts Firebase app/auth/firestore/functions from VITE_* env
  components/     AppShell, BrandMark
  jobs/           JobFeedPage, JobFilters, JobRow, useJobsQuery, useJobStatus,
                  useCompaniesMap, companyLogo, relevance, format, types
  appliedPage/    AppliedJobsPage
  notifications/  NotificationsPage, useNotificationSubscriptions, maskWebhook
  admin/          AdminCompaniesPage, CompanyForm
```

### Backend source map

```
functions/src/
  index.ts            exports + setGlobalOptions
  syncJobBoards.ts    scheduled + manual HTTPS
  syncSchedule.ts     concurrency + oldest-sync-first
  linkedinSchedule.ts LinkedIn due/quota/backoff
  syncOneCompany.ts   fetch → plan → batched writes
  syncPlan.ts         create / update / close planner
  notify.ts           collection-group match + Discord POST
  admin.ts            admin callables
  boardDetect.ts      Greenhouse / Ashby / Lever probe
  companyTokens.ts    bulk token split / slugify
  sources/            ashby, greenhouse, lever, linkedin
  http.ts             fetchWithRetry + concurrency limiter
  salary.ts, html.ts, location.ts (re-export from shared)
```

---

## 5. Data sources

All four sources normalize into the same `NormalizedJob` / `Job` shape. No API keys for Ashby, Greenhouse, or Lever.

### 5.1 Ashby

```
GET https://api.ashbyhq.com/posting-api/job-board/{boardName}?includeCompensation=true
```

`boardName` is the slug from `jobs.ashbyhq.com/{boardName}`. Slugs are often case-sensitive; detect/test tries raw, lowercase, and TitleCase variants (`ashbyTokenCandidates`).

- Skip jobs where `isListed === false`.
- Salary from `compensation.scrapeableCompensationSalarySummary` or `compensationTierSummary`.
- Multi-office: primary `location` plus `secondaryLocations[].location`, joined with ` | ` then parsed.
- `id` → `externalId`.

### 5.2 Greenhouse

```
GET https://boards-api.greenhouse.io/v1/boards/{boardToken}/jobs?content=true
```

- `content` is often HTML-entity-encoded; decoded before storing HTML / plain text.
- Salary: first `metadata[]` entry whose name matches `/pay|salary|compensation/i`, else a `$…–$…` regex on the HTML.
- `absolute_url` is both `jobPageUrl` and `applyUrl`.
- `id` → `externalId`.

Public Job Board API is unauthenticated and free. Harvest API is not used.

### 5.3 Lever

```
GET https://api.lever.co/v0/postings/{slug}?mode=json
```

JSON array. Title in `text`. HTML in `descriptionBody` / `description`. Locations from `categories.location` + `categories.allLocations`. Salary from `salaryRange` or `salaryDescriptionPlain`.

Empty `[]` with HTTP 200 can mean “no open roles” or a non-board. Auto-detect only accepts Lever when `jobCount > 0`. An already-saved Lever company may legitimately have zero jobs.

### 5.4 LinkedIn (best-effort guest listings)

No official public jobs read API. LinkedIn is an **explicit** company source (`li:{slug}`, `linkedin.com/company/{slug}/…`, or ATS forced to `linkedin`). Auto-detect of a bare token tries Greenhouse, Ashby, and Lever first; LinkedIn is a fallback (or first when the token is explicitly LinkedIn-shaped).

Pipeline (`functions/src/sources/linkedin.ts`):

1. Parse token → slug or numeric org id.
2. Resolve numeric org id via guest typeahead (`jobs-guest/api/typeaheadHits`) and verify against guest search HTML. Company pages often return LinkedIn’s custom **999** from cloud IPs, so typeahead is preferred.
3. Paginate `jobs-guest/jobs/api/seeMoreJobPostings/search?f_C={id}&start=…` in steps of 25, delay ~550ms, up to start≈975 (~1000 jobs). Sync default cap is **1000** (admin test probes 25).
4. Normalize title, location, and listing URL. Descriptions are usually empty (guest cards). Salary is always `null`.

**Caveats:** unofficial, may break or rate-limit (429 / 999) without notice, conflicts with LinkedIn ToS. Prefer Ashby / Greenhouse / Lever. Failures are per-company and do not abort the rest of the batch.

### 5.5 Fetch behavior

`fetchWithRetry` (`functions/src/http.ts`): 10s timeout, up to 2 retries on 429 / 5xx / network with jittered exponential backoff. LinkedIn uses its own fetch (browser User-Agent, 20s timeout) and does not go through `fetchWithRetry`.

### 5.6 Adding another ATS

Add a fetch+normalize module, a new `Ats` union member in `@jobradar/shared`, dispatch in `syncOneCompany` and `boardDetect` / admin UI, and a concurrency pool in `syncSchedule.ts`.

---

## 6. Data model (Firestore)

### 6.1 `companies/{id}`

Doc ID = slug (e.g. `stripe`). Written only via Admin SDK (admin callables or seed script).

```ts
interface Company {
  id: string;                 // doc id
  name: string;
  ats: 'ashby' | 'greenhouse' | 'lever' | 'linkedin';
  boardToken: string;         // ATS slug, or LinkedIn company slug / numeric id
  careersUrl?: string | null;
  logoUrl?: string | null;    // optional; used by the feed if present
  active: boolean;
  lastSyncedAt?: Timestamp;
  lastSyncStatus?: 'ok' | 'error' | null;
  lastSyncError?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy?: string;          // admin uid on first insert
}
```

`logoUrl` is optional and not set by admin forms today; the client still reads it if present.

### 6.2 `jobs/{id}`

Doc ID = `${ats}_${companyId}_${externalId}` (`jobDocId` in `functions/src/types.ts`). Deterministic → idempotent upserts.

```ts
interface Job {
  id: string;
  companyId: string;
  companyName: string;
  ats: 'ashby' | 'greenhouse' | 'lever' | 'linkedin';
  externalId: string;

  title: string;
  descriptionHtml: string;
  descriptionPlain: string;

  department?: string | null;
  team?: string | null;
  employmentType?: string | null;

  location: {
    raw: string;
    city?: string;
    state?: string;
    country?: string;
    isRemote: boolean;
    workplaceType?: 'Remote' | 'Hybrid' | 'InOffice' | 'Unknown';
    allCities?: string[];
    allStates?: string[];
    allCountries?: string[];
  };
  secondaryLocations?: string[];

  salary: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: 'year' | 'hour';
    raw?: string;
  } | null;

  applyUrl: string;
  jobPageUrl: string;

  postedAt: Timestamp;
  firstSeenAt: Timestamp;     // set once on create; never overwritten
  lastSeenAt: Timestamp;
  isActive: boolean;
  closedAt?: Timestamp | null;
}
```

`allCities` / `allStates` / `allCountries` exist so multi-location postings filter correctly (a job in “NYC | SF | Remote” matches a New York city filter).

The feed **re-parses `location.raw` client-side** via `normalizeStoredLocation` so older badly-parsed docs still filter correctly without a resync.

### 6.3 `users/{uid}/jobStatus/{jobId}`

```ts
interface JobStatus {
  jobId: string;
  status: 'not_applied' | 'applied';
  appliedAt?: Timestamp | null;
  updatedAt: Timestamp;
}
```

Missing doc = not applied. Only jobs the user has toggled have a document.

### 6.4 `users/{uid}/notificationSubscriptions/{subId}`

```ts
interface NotificationSubscription {
  id: string;
  discordWebhookUrl: string;  // treat as a secret
  filter: JobFilter;            // see §10
  active: boolean;              // user pause, or auto-false on Discord 404/401
  createdAt: Timestamp;
  lastNotifiedAt?: Timestamp | null;
}
```

`JobFilter` (shared):

```ts
interface JobFilter {
  keyword?: string;            // single include term (legacy / feed)
  keywords?: string[];         // OR include terms (alerts)
  excludeKeyword?: string;    // single exclude (legacy)
  excludeKeywords?: string[];  // OR exclude terms (alerts)
  city?: string;
  state?: string;
  country?: string;
  remoteOnly?: boolean;
  companyIds?: string[];
}
```

`sanitizeJobFilter` writes either `keyword` or `keywords` (never both), same for exclude, and drops empty fields so Firestore stays clean.

---

## 7. Sync engine

### 7.1 Schedule and resources

`syncJobBoards` (`functions/src/syncJobBoards.ts`):

- Schedule: **`every 1 hours`**
- Timeout: 540 seconds
- Memory: **1GiB** (full board HTML for many companies OOM’d at 512MiB)
- Region: `us-central1` (global `setGlobalOptions`)

`syncJobBoardsManual` is an `onRequest` with the same timeout/memory; returns `{ ok, companies, selected, greenhouse, ashby, lever, linkedinDue, linkedinSynced, newJobs, notified, errors }`.

### 7.2 Company selection

Active companies (`active == true`) are loaded once.

| ATS | Who runs this hour | Concurrency |
|---|---|---|
| Greenhouse | All active, oldest `lastSyncedAt` first | 3 |
| Ashby | All active, oldest first | 2 |
| Lever | All active, oldest first | 3 |
| LinkedIn | Only **due** companies, capped so the roster spreads across 24 hours | 1 |

LinkedIn due rules (`linkedinSchedule.ts`):

- Never synced → due.
- Last status `ok` → due after **24 hours**.
- Last status `error` and message looks like rate limit (429 / 999 / “rate limited”) → wait **6 hours**.
- Other errors → retry after **1 hour**.
- Quota per hourly tick: `ceil(linkedinCount / 24)`, at least 1 if any exist.

### 7.3 Per-company (`syncOneCompany`)

1. Fetch + normalize for that ATS.
2. Load existing `jobs` where `companyId == company.id`.
3. `planSyncPrecise`: fetched id not in Firestore → create (counts as `newJobs`); existing → update (preserve `firstSeenAt`); previously `isActive` but missing from fetch → close.
4. Batched writes (≤450 ops per batch):
   - Create: full job + `firstSeenAt` / `lastSeenAt` server timestamps, `isActive: true`, `closedAt: null`.
   - Update: merge mutable fields + `lastSeenAt`, `isActive: true`, `closedAt: null` (does not write `firstSeenAt`).
   - Close: `isActive: false`, `closedAt: serverTimestamp()`. Jobs are never deleted.
5. Company doc: `lastSyncedAt`, `lastSyncStatus: 'ok'`, `lastSyncError` deleted. On failure: `lastSyncStatus: 'error'`, `lastSyncError` truncated to 500 chars. The company failure does not abort other companies.
6. Return `{ newJobs, upserted, closed, ok, error? }`.

After all companies finish, if any `newJobs`, `notifySubscribersOfNewJobs` runs.

---

## 8. Firestore security rules

`firestore.rules` as deployed:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }
    function isAdmin() {
      return isSignedIn() && request.auth.token.admin == true;
    }

    match /companies/{companyId} {
      allow read: if isSignedIn();
      allow write: if false;
    }

    match /jobs/{jobId} {
      allow read: if isSignedIn();
      allow write: if false;
    }

    match /users/{uid}/jobStatus/{jobId} {
      allow read, write: if isSignedIn() && request.auth.uid == uid;
    }

    match /users/{uid}/notificationSubscriptions/{subId} {
      allow read, write: if isSignedIn() && request.auth.uid == uid;
    }
  }
}
```

`isAdmin()` is defined but unused; company mutations are Admin SDK only. Cloud Functions bypass rules.

**Indexes** (`firestore.indexes.json`):

- Composite `jobs`: `isActive` ASC + `firstSeenAt` DESC (feed query).
- Collection-group field override on `notificationSubscriptions.active` (notify query).

---

## 9. Authentication & authorization

**Current (testing / personal use):** Email/Password in Firebase Auth. `/login` offers Sign in and Create account. Extra accounts cannot read another user’s `jobStatus` or subscriptions, and cannot call admin functions without the `admin` custom claim.

**Admin claim:** set once locally:

```bash
USER_UID=... npx tsx scripts/set-admin-claim.ts
```

`scripts/set-admin-claim.ts` calls `setCustomUserClaims(uid, { admin: true })`. The user must sign out/in (or refresh the ID token) so `AuthContext` sees `token.claims.admin === true`. Admin callables check `request.auth.token.admin === true` server-side; `AdminRoute` is UX only.

**Lock-down (not implemented):** remove the sign-up toggle, or add an `admins/{uid}` allowlist in rules. Credentials are never in source.

---

## 10. Shared filter & location logic

`packages/shared` is imported by both the SPA and Cloud Functions so feed filtering and Discord matching cannot drift.

### 10.1 `matchesFilter(job, filter)`

- Empty fields = no constraint.
- **Keywords:** OR — any term may hit `title` or `descriptionPlain` (case-insensitive substring).
- **Exclude keywords:** OR — any hit **rejects** the job.
- **remoteOnly:** requires `location.isRemote`.
- **city / state / country:** match primary field **or** any `all*` entry. Cities/states/countries are compared via `canonicalizeCity` / `canonicalizeState` / `canonicalizeCountry` (NYC ≡ New York City; “New York” ≡ NY). State filters also match if a job city maps to that state (`homeStateForCity`).
- **companyIds:** job’s `companyId` must be in the list.

Feed uses a single `keyword` plus location/remote. Alerts UI currently writes `keywords` / `excludeKeywords` / `remoteOnly` only.

### 10.2 Location parser (`packages/shared/src/location.ts`)

Used at ingest (`functions` re-export) and on the client (`normalizeStoredLocation`).

- Splits multi-location strings on `|` / `;`.
- Detects remote/hybrid from text and ATS hints.
- US states + DC, Canadian provinces, a large country-alias table, and city aliases (NYC, SF, …).
- Never throws; unparseable input keeps `raw` and `workplaceType: 'Unknown'`.
- Filter dropdowns: full US/CA state list and known countries (not limited to loaded jobs). City list = canonical aliases ∪ cities present on loaded jobs.

---

## 11. Discord notifications

### 11.1 User flow (`/notifications`)

1. Paste an Incoming Webhook URL (`https://discord.com/api/webhooks/…` or `discordapp.com`).
2. Optional include keywords (one per line or comma-separated; any term matches).
3. Optional exclude keywords (any term skips the job).
4. Optional remote-only.
5. **Test webhook** POSTs `{ content: "JobRadar test — webhook connected ✅" }` **from the browser**.
6. Save writes `users/{uid}/notificationSubscriptions` via `addDoc` after `sanitizeJobFilter`. Saved URLs are shown masked (`maskWebhook`).
7. Pause / resume / delete from the list.

Subscriptions are not edited in place; create a new one and delete the old.

### 11.2 Matching & sending (`functions/src/notify.ts`)

At the end of a sync, if `newJobs.length > 0`:

1. Collection-group query: `notificationSubscriptions` where `active == true`.
2. For each sub, `matchesFilter` against each new job.
3. One Discord `content` message per subscription (never one message per job). Cap listed jobs at 10; extra counted as `_+N more_`.
4. Format:

   ```
   **JobRadar — 3 new matches** for "software engineer" / "staff"
   • **Stripe** — Backend Engineer — New York, NY
   • **Ramp** — SWE II — Remote
   ```

   Include-keyword label uses `resolveFilterKeywords`. Location formatting mirrors the feed (`formatJobLocation`). Apply URLs and a feed deep-link are **not** included today.
5. POST JSON `{ content }` to the webhook. 204/2xx → `lastNotifiedAt`. 404/401 → `active: false`. 429 → wait up to 5s using `retry-after`, one retry. Network/5xx → skip this run, leave `active`.
6. One bad webhook does not abort others.

### 11.3 Why server-side

Alerts must fire when the site is closed. Phone push is Discord’s own channel notifications.

### 11.4 Cost & caveats

Incoming Webhooks are free: no Nitro, no per-message fee, no Discord app for send-only. Rate limits (~30 messages/minute per webhook) are far above personal volume.

Caveats: Discord (or the browser) must have notifications enabled; the webhook URL is a write credential (owner-only rules; never log it in full); one-way only; unsubscribe is pause/delete in JobRadar or delete the webhook in Discord.

---

## 12. Admin: company master list

### 12.1 Callables (`functions/src/admin.ts`)

All require `admin: true` on the ID token.

| Function | Payload | Behavior |
|---|---|---|
| `adminTestCompanyBoard` | `{ ats?, boardToken }` | Live fetch, no write. `ats` omitted/`auto` probes GH/Ashby/Lever then LinkedIn. Explicit `li:` / LinkedIn URL skips to LinkedIn. |
| `adminUpsertCompany` | `{ id, name, ats, boardToken, careersUrl?, active }` | Merge into `companies/{id}`. LinkedIn token normalized to slug. |
| `adminBulkUpsertCompanies` | `{ ats?: 'auto' \| Ats, tokens }` | Up to **80** tokens (comma / semicolon / newline). Auto-detect ATS, slugify id, humanize name. Failed tokens returned so the UI can retry them. 540s / 512MiB. |
| `adminSetCompanyActive` | `{ id, active }` | Pause / resume. |
| `adminDeleteCompany` | `{ id }` | Deletes the company doc only. Jobs remain. |

Detect ranking (`detectBoardAts`): prefer more jobs; tie-break Greenhouse > Ashby > Lever. LinkedIn is never selected by the three-way probe.

### 12.2 Admin UI (`/admin/companies`)

- Live table of companies: name, ATS, board token, active/paused, last sync relative + absolute time, inline `lastSyncError`.
- Sort: latest sync or name. Status filter: all / errors / ok / never synced.
- **Add companies** (default **bulk**): paste tokens such as `stripe, activecampaign, li:openai`. Single-company form: id, name, ATS, board token, optional careers URL; **Test connection** must succeed before Save.
- Row actions: Pause/Resume, Delete (confirm). No edit form.

---

## 13. Frontend behavior

### 13.1 Routes

| Route | Guard | Purpose |
|---|---|---|
| `/login` | Public | Email/password sign-in + sign-up |
| `/` | Signed in | Feed |
| `/applied` | Signed in | Jobs marked applied (compact log rows) |
| `/notifications` | Signed in | Discord subscriptions |
| `/admin/companies` | Signed in + `admin` claim | Company list |
| `*` | — | Redirect to `/` |

Nav: Feed / Applied / Alerts / Admin (if admin) / Sign out. `AppShell` + `BrandMark`.

### 13.2 Feed (`JobFeedPage`)

- Query: `jobs` where `isActive == true`, `orderBy firstSeenAt desc`, **`limit(2000)`**.
- Client re-normalizes locations; `matchesFilter`; hide applied (default on); sort newest or relevance.
- **Most Relevant** only reorders when a keyword is set:

  ```ts
  exact title +100, prefix +60, title includes +35, description includes +10,
  recency: max(0, 20 - hoursOld / 6)
  ```

- Pagination: **24** jobs per page, card grid (`sm: 2` cols, `xl: 3`).
- Filters sit in a sticky left “Layers” legend (not a horizontal strip).
- Count line: `N signals · page X of Y`.

### 13.3 Job presentation (`JobRow`)

Two variants:

- **`card` (feed):** bordered paper-2 tile, company logo/monogram, relative time, signal pip if `firstSeenAt` within 2 hours (left ochre border), excerpt ~160 chars, expand sanitized HTML (`DOMPurify`), Apply + Mark applied. Applied rows are dimmed with a “Filed” mark and struck title.
- **`row` (applied page):** original Signal Log compact row — time gutter, spine rule, longer excerpt.

### 13.4 Company logos

`companyLogoCandidates`: optional `logoUrl` on the company doc, else Hunter.io `logos.hunter.io/{domain}`, else Google favicon. Domain from `careersUrl`, else a small override map (`openai.com`, `notion.so`, …), else `{boardToken}.com`. `CompanyMark` walks candidates and falls back to initials.

### 13.5 Applied page

Same active-jobs listener, filtered to `statusMap === 'applied'`, log-row layout. Toggling off applied writes `not_applied`.

### 13.6 Applied tracking writes

`useJobStatus` listens to `users/{uid}/jobStatus` once and exposes a `Map`. Toggle `setDoc` merges `{ jobId, status, appliedAt, updatedAt }`.

---

## 14. Visual design — Signal Log (shipped)

**Name in tokens/comments:** `signal-log`.

Cool mineral paper, deep ink, single **signal-ochre** accent for “new.” Bricolage Grotesque wordmark, IBM Plex Sans + Mono. Loaded from Google Fonts in `apps/web/index.html`.

### Tokens (`apps/web/src/index.css`)

```css
:root {
  --paper:        #D7E0DB;
  --paper-2:      #C9D5CF;
  --ink:          #101C1F;
  --ink-muted:    #3D5250;
  --rule:         #8FA39B;
  --rule-faint:   #B7C6C0;
  --signal:       #C8960A;
  --signal-ink:   #1A1400;
  --sea:          #155E52;   /* Apply, sync-ok */
  --fault:        #9E2F22;
}
```

Tailwind v4 `@theme` maps these to `paper`, `ink`, `signal`, `sea`, `fault`, `font-brand`, `font-sans`, `font-mono`.

### What actually rendered vs original “no cards” grammar

The original spec banned card grids. **The live feed is a card grid** (`JobRow variant="card"`). Applied / admin / alerts lists remain ruled rows. Filters are a **sidebar legend**, not a strip above a continuous log. Keep the palette, type, and motion; do not “fix” the feed back to a single log unless product asks for it.

### Brand

Wordmark **JobRadar** + sector-arc SVG (`BrandMark`). Login: paper field, faint azimuth SVG, tagline “New postings, logged within minutes.”, email/password. No feature grid.

### Motion (implemented)

1. **Ping-in:** fresh pip scales 0→1 (~200ms).
2. **Row/card draw:** translateX 10px + opacity (~150ms).
3. **Apply hover:** underline draws left→right in `--sea` (~120ms).

`prefers-reduced-motion: reduce` disables 1–2 and shows the Apply underline immediately.

### Anti-patterns (still in force)

No purple/glow/glass; no Inter/Roboto/Geist as brand; no dashboard stat strip competing with the log; no emoji as UI chrome. Do not invent extra accent colors.

---

## 15. Seed scripts & environment

### Seed companies

```bash
npx tsx scripts/seed-companies.ts
```

Reads `scripts/companies.json` (Anthropic, Ashby, Stripe samples) and merges into `companies/{id}` via Admin SDK. Day-to-day adds should use `/admin/companies` (especially bulk auto-detect). Seed JSON ATS type is still typed as ashby | greenhouse only — extend the script if seeding Lever/LinkedIn from file.

### Env

No ATS API keys. Discord URLs live on subscription docs.

| Variable | Where | Purpose |
|---|---|---|
| `VITE_FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID` | `apps/web/.env` (see `.env.example`) | Web SDK config — not secret, but keep out of git |
| `discordWebhookUrl` on each subscription | Firestore, owner-only | Alert destination |
| `GOOGLE_APPLICATION_CREDENTIALS` / ADC | Local scripts only | Seed + set-admin-claim |

Cloud Functions use default Admin credentials. Client `getFunctions(app)` uses the default functions region (must stay aligned with `us-central1`).

---

## 16. Deployment

1. Firebase project on Blaze; enable Auth (Email/Password), Firestore, Functions, Hosting.
2. `.firebaserc` project id; `apps/web/.env` from `.env.example`.
3. `firebase deploy --only firestore:rules,firestore:indexes,functions,hosting`  
   Functions predeploy builds shared + packed-shared + `tsc`.
4. Optional: `npx tsx scripts/seed-companies.ts`.
5. Create a user in the app, then `USER_UID=… npx tsx scripts/set-admin-claim.ts`.
6. Trigger sync: wait for the hourly schedule, or GET/POST the `syncJobBoardsManual` URL.
7. `/notifications` → paste webhook → Test webhook → Save.

Hosting: `public` is `apps/web/dist`; SPA rewrite `**` → `/index.html`. Build web with `npm run build` (shared then web) before hosting deploy if not using a CI step that already builds.

---

## 17. Testing (what exists)

Run from repo root: `npm test` (shared → functions → web).

| Area | Location | Covers |
|---|---|---|
| `matchesFilter` / keyword lists / exclude | `packages/shared/src/jobFilter.test.ts` | Include/exclude OR, city aliases, sanitize |
| Location parser | `packages/shared/src/location.test.ts` | Cities, remote, multi-location, filters |
| Normalizers + sync plan | `functions/src/__tests__/sync.test.ts` | Ashby/Greenhouse fixtures; create/update/close |
| Lever / LinkedIn | `leverLinkedin.test.ts` | Token parse, guest HTML cards, Lever normalize |
| LinkedIn schedule | `linkedinSchedule.test.ts` | Due/quota/backoff |
| Sync selection | `syncSchedule.test.ts` | Concurrency constants / sort |
| Detect ATS | `detectAts.test.ts` | Ranking |
| Company tokens | `companyTokens.test.ts` | Split/slugify |
| Discord + admin gate | `notifyAdmin.test.ts` | Message format (incl. location), webhook 204/404, admin claim |
| Live fetch (optional) | `liveFetch.test.ts` | Real Ashby/Greenhouse when enabled |
| Relevance | `apps/web/src/jobs/relevance.test.ts` | Scoring |

Fixtures: `functions/src/fixtures/{ashby,greenhouse,lever}-sample.json`. Discord tests mock `fetch` — they do not POST to a real webhook.

---

## 18. Known gaps & open assumptions

Documented so they are not re-derived as bugs:

- **Poll interval is hourly**, not 5 minutes. Tightening it needs a hard look at LinkedIn 999s, Ashby undocumented limits, and function duration/memory.
- **`syncJobBoardsManual` is unauthenticated.** Restrict or delete before treating the project as public.
- Alert form does not expose city/state/country/`companyIds` even though `matchesFilter` and the data model support them.
- Feed keyword is a single substring; alerts support multi-term OR. Feed does not have exclude keywords.
- Discord messages omit apply URLs and a feed link.
- Admin cannot edit name/token/ATS of an existing company in the UI.
- Company seed script ATS union is ashby | greenhouse only.
- Closed jobs are kept forever; no prune job.
- LinkedIn guest scrape is best-effort and may systematically fail from Cloud Functions IPs.
- Assumed the operator maintains the company list (no ATS discovery crawler).
- Assumed one admin for V1; extra admins are additional `admin: true` claims, no code change.
- Bounded window of 2000 active jobs is the current clip point (was 500 in the original spec). If that clips, either raise the limit or add a search index.
