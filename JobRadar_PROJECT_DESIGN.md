# JobRadar — Project Design Document

**Purpose:** A personal job-board monitoring website that watches a curated list of companies' Ashby, Greenhouse, Lever, and (as a last resort) LinkedIn job boards, surfaces brand-new postings within minutes, and lets you filter, sort, track application status, and get a Discord notification the moment something matches a saved filter — so you're consistently one of the first applicants.

**Audience for this doc:** Cursor (or any coding agent) implementing this end-to-end. Every section below is meant to be actionable — data shapes, endpoints, security rules, and a phased build order are all specified explicitly so implementation doesn't require re-deriving architecture decisions.

---

## 1. Goals & Non-Goals

### Goals (V1)
- Poll a master list of companies' Ashby, Greenhouse, Lever, and LinkedIn boards on a schedule, detect new postings, and write them to a shared database that all logged-in clients see update live (no manual refresh needed).
- New postings visible on the site within **10 minutes** of appearing on the source board (target: 5-minute poll interval, giving buffer).
- Single authenticated user (you), using real Firebase Auth — no hardcoded credentials anywhere in the codebase.
- Job rows show: title, description, company, location, salary (if the source provides it), and a direct apply link — plus useful extras (department, employment type, remote/hybrid/onsite, posted date, "first seen by us" timestamp). UI follows the **Signal Log** visual system (§9.7).
- Filter by title keyword, location (city/state/country + remote toggle), and sort by Newest or Most Relevant.
- Mark any job Applied / Not Applied, persisted per-user, with a filter to hide/show applied jobs.
- **Users can subscribe a Discord channel (via Incoming Webhook) to alerts for new jobs matching a saved filter** (keyword/location/remote/company) — see §10. Chosen over SMS/WhatsApp specifically because Discord Incoming Webhooks are genuinely free (no per-message charge, no paid plan, no phone number) — see §10.4 for exactly why, and the honest caveats.
- **The admin user (you) can add, edit, pause, and remove companies from the master list directly on the website**, without touching Firestore console or redeploying — see §11.

### Non-Goals (V1 — explicitly deferred)
- Email/SMS/WhatsApp/push notifications (Discord is now in scope, per above; other channels remain a future option, not built now).
- Multi-user roles beyond "signed-in user" and "admin" — no teams, sharing, or per-user company lists.
- ATS platforms beyond Ashby, Greenhouse, Lever, and best-effort LinkedIn (e.g. Workday) — architecture remains easy to extend.
- Scraping LinkedIn via paid proxies/Apify — V1 uses public guest endpoints only and accepts rate-limit fragility.
- Full-text/fuzzy search at scale (Algolia/Typesense) — V1 uses client-side filtering over a bounded, indexed Firestore query, with a documented upgrade path.
- Automated application submission.
- A full Discord bot (slash commands, DMs, interactive buttons, two-way conversation) — V1 uses **Incoming Webhooks only** (one-way POST into a channel). Pause/delete of subscriptions happens in the JobRadar UI, not via Discord replies.

---

## 2. High-Level Architecture

```
                     ┌─────────────────────────────┐
                     │   Cloud Scheduler (cron)     │
                     │   every 5 minutes            │
                     └──────────────┬───────────────┘
                                    │ triggers
                                    ▼
                     ┌───────────────────────────────────┐
                     │  Firebase Cloud Function            │
                     │  "syncJobBoards" (v2, scheduled)     │
                     │  1. reads companies list              │
                     │  2. fetches Ashby/Greenhouse             │
                     │  3. normalizes + upserts jobs              │
                     │  4. marks closed postings                    │
                     │  5. matches new jobs against active          │
                     │     notification subscriptions                │
                     │  6. POSTs a Discord webhook message           │
                     │     per matching subscription                │
                     └──────────────┬─────────────────┬────────────┘
                                    │ writes             │ HTTP POST
                                    ▼                    ▼
                     ┌─────────────────────────┐   ┌────────────────────┐
                     │        Firestore          │   │  Discord Incoming     │
                     │  companies / jobs / users   │   │  Webhook (channel URL) │
                     │                              │   │  — free, see §10.4      │
                     └──────────────┬─────────────┘   └────────────────────┘
                                    │ onSnapshot (real-time)
                                    ▼
                     ┌─────────────────────────────────┐
                     │   React SPA (Firebase Hosting)      │
                     │   - Firebase Auth login               │
                     │   - live job feed                       │
                     │   - filters / sort / applied               │
                     │   - notification-subscription manager        │
                     │   - admin: manage company master list          │
                     │     (calls admin-only Cloud Functions)          │
                     └─────────────────────────────────┘
```

**Key architectural decisions:**
- Job-board polling happens **server-side** (Cloud Functions on a schedule), never in the browser — it must run continuously regardless of who has the site open, must run once and fan out to all users via Firestore, and avoids relying on Ashby/Greenhouse setting permissive CORS headers.
- Discord notification sending also happens **server-side**, as the last step of the same scheduled sync run, so "new jobs this run" and "who should be notified about them" are evaluated together, in-memory, without extra round-trips — see §10. It POSTs directly to a Discord Incoming Webhook URL (no Twilio, no Meta BSP, no paid intermediary — see §10.4 for why that matters for cost).
- All writes to the master company list go through **admin-only Cloud Functions** (not direct client writes to Firestore), so the same fetch/validate logic used by the sync engine can validate a company before it's saved — see §11.

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript + Vite | Fast local dev, easy Firebase Hosting deploy |
| Styling | Tailwind CSS + design tokens from §9.7 | Implements the **Signal Log** visual system — not a generic SaaS skin; see §9.7 for colors, type, layout rules, and anti-patterns |
| Auth | Firebase Authentication (Email/Password) | Self-service sign-up during testing; lockable to one account later (§8) |
| Database | Cloud Firestore | Real-time listeners give "instant update" behavior for free |
| Backend jobs | Firebase Cloud Functions (2nd gen, Node.js 20, TypeScript) | Scheduled sync function + callable admin functions + notification sending, all in one `functions/` deployable |
| Scheduling | Cloud Scheduler (via Firebase `onSchedule`) | Every 5 minutes |
| Notification delivery | **Discord Incoming Webhooks** (HTTP POST to a channel webhook URL) | Free — part of Discord's free platform; no bot account, no paid plan, no per-message charge; see §10.4 for exactly why, including the honest caveats |
| Hosting | Firebase Hosting | Single SPA deploy target, same project as everything else |
| Company list source of truth | Firestore `companies` collection, mutated only via admin Cloud Functions | Editable from the website (§11), no redeploy or console access needed |
| Shared filter/match logic | A small pure-function module (e.g. `packages/shared/jobFilter.ts` in an npm-workspaces monorepo) | Used by both the frontend (feed filtering) and the backend (notification matching) so "what shows in the feed" and "what triggers a message" can never drift apart |

**Cost summary:** Firebase stays at $0/month in normal operation at this scale (free-tier quotas comfortably cover it — see §4.3). Discord delivery is *also* $0/month: Incoming Webhooks are a built-in free Discord feature (no Developer Portal paid tier, no per-message fee, no phone number or carrier fees). This is a meaningfully cheaper and simpler story than Twilio SMS or Meta WhatsApp Cloud API, which is why Discord was chosen here — see §10.4.

---

## 4. Data Sources: Ashby & Greenhouse Public APIs

Both platforms expose unauthenticated, public read-only JSON endpoints intended for exactly this use case (building an external job board). No API keys needed for reading.

### 4.1 Ashby

```
GET https://api.ashbyhq.com/posting-api/job-board/{boardName}?includeCompensation=true
```
`{boardName}` is the slug from the company's hosted board URL, e.g. `jobs.ashbyhq.com/Ashby` → boardName is `Ashby`.

Representative response shape:
```json
{
  "apiVersion": "1",
  "jobs": [
    {
      "id": "abc123",
      "title": "Product Manager",
      "location": "Houston, TX",
      "secondaryLocations": [
        { "location": "San Francisco", "address": { "addressLocality": "San Francisco", "addressRegion": "California", "addressCountry": "USA" } }
      ],
      "department": "Product",
      "team": "Growth",
      "isListed": true,
      "isRemote": true,
      "workplaceType": "Remote",
      "descriptionHtml": "<p>Join our team</p>",
      "descriptionPlain": "Join our team",
      "publishedAt": "2021-04-30T16:21:55.393+00:00",
      "employmentType": "FullTime",
      "address": { "postalAddress": { "addressLocality": "Houston", "addressRegion": "Texas", "addressCountry": "USA" } },
      "jobUrl": "https://jobs.ashbyhq.com/example_job",
      "applyUrl": "https://jobs.ashbyhq.com/example_job/apply",
      "compensation": { "compensationTierSummary": "$140K – $180K + Equity" }
    }
  ]
}
```
Notes for the sync function:
- Only ingest jobs where `isListed !== false`.
- `compensation` only appears when `includeCompensation=true` is passed, and even then many companies don't publish it — treat as optional.
- Use `id` as the externalId.

### 4.2 Greenhouse

```
GET https://boards-api.greenhouse.io/v1/boards/{boardToken}/jobs?content=true
```
`{boardToken}` is the slug from `boards.greenhouse.io/{boardToken}`.

Representative response shape:
```json
{
  "jobs": [
    {
      "id": 6088720,
      "title": "Software Engineer",
      "updated_at": "2026-07-20T10:00:00-04:00",
      "location": { "name": "New York, NY" },
      "content": "<div>Full HTML job description...</div>",
      "absolute_url": "https://boards.greenhouse.io/company/jobs/6088720",
      "departments": [{ "id": 123, "name": "Engineering" }],
      "offices": [{ "id": 456, "name": "New York" }],
      "metadata": [
        { "name": "Pay Range", "value": "$150,000 - $190,000" }
      ]
    }
  ]
}
```
Notes for the sync function:
- Greenhouse rarely has a structured salary field. Check `metadata[]` for an entry whose `name` matches `/pay|salary|compensation/i` first; if none, regex-scan the `content` HTML for a currency-range pattern (e.g. `/\$[\d,]+\s*[-–]\s*\$[\d,]+/`) as a best-effort fallback; otherwise store `salary: null` and render "Not listed" in the UI.
- `location.name` is free text (e.g. "New York, NY", "Remote - US", "London, UK"). Normalize with a small parser (see §6.3) and don't block ingestion if parsing fails — fall back to storing the raw string.
- Use `id` as the externalId; `absolute_url` as both jobPageUrl and applyUrl (Greenhouse's boards don't have a separate "apply" vs "view" URL — the apply form is on the same page).

### 4.3 Rate limits & cost — do these APIs require money?

**No — both are free, public, unauthenticated read endpoints, and neither requires an API key or paid plan for what this project needs.** Details, since the two platforms differ in how they handle load:

**Greenhouse Job Board API** (`boards-api.greenhouse.io/...` — what this project uses):
- Greenhouse's own developer docs describe this specific endpoint as publicly accessible without authentication, heavily cached, and not subject to hard rate limits — explicitly contrasting it with their separate **Harvest API** (a different, authenticated product for internal recruiting automation), which *is* throttled within short (10-second) rolling windows. This project never touches the Harvest API, so that limit doesn't apply here.
- There's no published hard ceiling on the Job Board endpoint, but third-party integration guides note Greenhouse does throttle abusive callers even though no explicit number is published, and that reasonable polling patterns (spread across many boards rather than hammering one board in a tight loop) work reliably long-term. Polling each board once every 5 minutes, spread across dozens/hundreds of distinct boards rather than repeatedly hitting one, is well within "reasonable" — but the sync engine should still be a good citizen (see below).
- Fully free — no billing account, key, or partner enrollment required for read access.

**Ashby Job Postings API** (`api.ashbyhq.com/posting-api/job-board/...` — what this project uses):
- Officially documented, free, and designed for exactly this use case (external career pages) — no API key needed to read.
- Unlike Greenhouse, Ashby doesn't publish an explicit rate-limit policy for this endpoint. Third-party integrations report it tolerating at least moderate concurrency without issue, but since it's undocumented, the sync engine treats it more conservatively than Greenhouse (see concurrency settings below).
- Ashby does sell a separate, paid **real-time data-feed product** ("custom delivery options, searching, refresh rates") aimed at companies wanting push-based/enterprise-grade access — starting around $1,000/month. **This project does not need it**: the free `posting-api/job-board` endpoint, polled on our own 5-minute schedule, fully satisfies the requirements here at zero cost.

**Practical implication for the sync engine (§6):**
- Greenhouse boards can be fetched with slightly higher concurrency (it's cache-backed on their end).
- Ashby boards are fetched more conservatively and with exponential-backoff retry on `429`, since its limits aren't published.
- Both fetchers must check for a `429` response and back off (jittered exponential backoff, 2-3 retries max) rather than hammering — this costs nothing to implement and protects against ever being blocked, even though neither platform is expected to return 429 under this project's load.
- Firebase itself: scheduled Cloud Functions require the **Blaze** (pay-as-you-go) plan to exist at all (Cloud Scheduler needs a billing account attached), but at this project's scale — a scheduled function running every 5 minutes, a small Firestore dataset, one user — usage stays comfortably inside Firebase's standing free-tier quotas (2M function invocations/month, 50K Firestore reads/day, etc.), so the realistic monthly bill for the Firebase side is **$0**. Discord notifications add **$0** as well (Incoming Webhooks are free — see §10.4).

### 4.4 Lever (public postings API)

```
GET https://api.lever.co/v0/postings/{slug}?mode=json
```

`{slug}` is the path segment from `jobs.lever.co/{slug}`. Returns a JSON array of postings (title in `text`, HTML in `description` / `descriptionBody`, `hostedUrl` / `applyUrl`, `categories.location`, `createdAt` ms). Empty `[]` with HTTP 200 can mean “no open roles” or a non-board; auto-detect only accepts Lever when `jobCount > 0` unless forced in admin.

### 4.5 LinkedIn (best-effort guest listings)

There is **no official public LinkedIn jobs read API**. JobRadar supports LinkedIn only as an **explicit** company source (`li:{slug}` or `linkedin.com/company/{slug}/…`):

1. Resolve slug → numeric organization id from the public company/jobs page HTML.
2. Paginate guest search: `jobs-guest/jobs/api/seeMoreJobPostings/search?f_C={id}&start=…` (cap ~100 jobs / company / sync).
3. Normalize into the same `Job` shape; soft-fail per company on 429/blocks without aborting the batch.

**Caveats:** guest endpoints are unofficial, may break or rate-limit without notice, and conflict with LinkedIn ToS. Prefer Ashby / Greenhouse / Lever whenever available. Auto-detect never selects LinkedIn.

### 4.6 Adding a new ATS later
Sources normalize into the same internal `Job` shape (§5.2). To add another ATS: a fetch+normalize module, a new `ats` enum value, sync dispatch + concurrency pool, and admin detect/UI wiring.

---

## 5. Data Model (Firestore)

### 5.1 `companies` collection — the master list
Doc ID = a slug you choose (e.g. `stripe`, `anthropic`).

```ts
interface Company {
  id: string;                 // doc id / slug
  name: string;                // "Stripe"
  ats: 'ashby' | 'greenhouse' | 'lever' | 'linkedin';
  boardToken: string;          // ATS board slug, or LinkedIn company slug
  careersUrl?: string;         // human-facing careers page, for reference
  active: boolean;             // false = paused, skipped by sync
  lastSyncedAt?: Timestamp;
  lastSyncStatus?: 'ok' | 'error';
  lastSyncError?: string;      // e.g. "404 - board token may have changed"
  createdAt: Timestamp;
  updatedAt: Timestamp;         // bumped on every admin edit
  createdBy?: string;           // admin uid, for an audit trail
}
```
This is the **master list** required by the spec. It lives in Firestore (not a hardcoded file) so it can be edited without a redeploy. It's seeded once from a local JSON/CSV via a bootstrap script (§13), and from then on managed entirely through the admin UI (§11) — the client never writes to this collection directly; all mutations go through admin-only Cloud Functions.

### 5.2 `jobs` collection — normalized postings
Doc ID = `${ats}_${companyId}_${externalId}` (deterministic → safe upsert, no duplicate risk).

```ts
interface Job {
  id: string;
  companyId: string;
  companyName: string;
  ats: 'ashby' | 'greenhouse' | 'lever' | 'linkedin';
  externalId: string;

  title: string;
  descriptionHtml: string;
  descriptionPlain: string;    // stripped-tag version, used for keyword search & relevance scoring

  department?: string;
  team?: string;
  employmentType?: string;     // "FullTime", "Intern", etc. (best-effort, source-dependent)

  location: {
    raw: string;                // original string, always populated
    city?: string;
    state?: string;
    country?: string;
    isRemote: boolean;
    workplaceType?: 'Remote' | 'Hybrid' | 'InOffice' | 'Unknown';
  };
  secondaryLocations?: string[]; // additional office options, raw strings

  salary: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: 'year' | 'hour';
    raw?: string;
  } | null;

  applyUrl: string;
  jobPageUrl: string;

  postedAt: Timestamp;    // source's publishedAt / updated_at
  firstSeenAt: Timestamp; // set once, when our sync first discovered it — drives "new" badge, Newest sort, and notification matching
  lastSeenAt: Timestamp;  // updated every sync run the job is still present
  isActive: boolean;      // false once it disappears from the source board
  closedAt?: Timestamp | null;
}
```

### 5.3 `users/{uid}/jobStatus/{jobId}` — per-user applied tracking
```ts
interface JobStatus {
  jobId: string;                      // == parent job doc id
  status: 'not_applied' | 'applied';
  appliedAt?: Timestamp | null;
  updatedAt: Timestamp;
}
```
Only written for jobs the user has touched (default state — no doc — is treated as `not_applied` client-side).

### 5.4 Why this shape
- Deterministic job doc IDs make the sync function idempotent — safe to re-run, safe to retry on partial failure, no duplicate-detection logic needed beyond the ID itself.
- Splitting "applied" state into a per-user subcollection (rather than a field on the job doc) means the shared `jobs` collection never needs a write from the client, which keeps its security rule simple (read-only) and avoids write contention across users.

### 5.5 `users/{uid}/notificationSubscriptions/{subId}` — saved Discord alert filters
```ts
interface NotificationSubscription {
  id: string;
  discordWebhookUrl: string;  // full Incoming Webhook URL for a Discord channel,
                              // e.g. "https://discord.com/api/webhooks/{id}/{token}"
                              // Treat as a secret: anyone with this URL can post to the
                              // channel. Created once in Discord (Channel → Integrations →
                              // Webhooks) and pasted into JobRadar; see §10.1 / §10.4
  filter: {
    keyword?: string;            // matched the same way as the feed's keyword filter (§9.4)
    city?: string;
    state?: string;
    country?: string;
    remoteOnly?: boolean;
    companyIds?: string[];       // optional: restrict alerts to specific companies
  };
  active: boolean;               // toggle off without deleting; also auto-set to false if
                                  // Discord returns a permanent failure (unknown webhook / 404)
  createdAt: Timestamp;
  lastNotifiedAt?: Timestamp | null;
}
```
A user can create multiple subscriptions (e.g. one for "forward deployed engineer, NYC" posting to `#eng-alerts`, and another for "quant, remote" posting to `#quant-alerts`), each with its own webhook URL if desired — or the same webhook for everything. For personal use, one private Discord server with a single `#job-alerts` channel and one webhook is the typical setup, and it's free. Kept as a subcollection under `users/{uid}` for the same reason as `jobStatus` — trivial, owner-only security rule, no risk of one user's alert filters leaking to another.

**Security note on storing webhook URLs in Firestore:** the webhook URL *is* the credential (there is no separate API key). Firestore security rules already restrict read/write of `notificationSubscriptions` to the owning `uid` (§7), and the Cloud Function reads them via the Admin SDK. Still: never log the full URL, never echo it back in error messages to non-owners, and prefer showing a masked form in the UI (e.g. `…/webhooks/123…/••••••••`). If a URL is ever leaked, regenerate/delete the webhook in Discord Channel Settings — old URLs stop working immediately.

---

## 6. Backend: Sync Engine (Cloud Functions)

### 6.1 Scheduled function
```ts
// functions/src/syncJobBoards.ts
export const syncJobBoards = onSchedule(
  { schedule: 'every 5 minutes', timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    const companies = await getActiveCompanies();
    // Run each ATS's companies through its own concurrency limiter (see §4.3):
    // Greenhouse is cache-backed and tolerant of higher concurrency; Ashby's
    // limits are undocumented, so it's throttled more conservatively.
    const greenhouseCompanies = companies.filter(c => c.ats === 'greenhouse');
    const ashbyCompanies = companies.filter(c => c.ats === 'ashby');
    const leverCompanies = companies.filter(c => c.ats === 'lever');
    const linkedinCompanies = companies.filter(c => c.ats === 'linkedin');
    const [ghResults, ashbyResults, leverResults, linkedinResults] = await Promise.all([
      runWithConcurrencyLimit(greenhouseCompanies, /* concurrency */ 10, syncOneCompany),
      runWithConcurrencyLimit(ashbyCompanies, /* concurrency */ 5, syncOneCompany),
      runWithConcurrencyLimit(leverCompanies, /* concurrency */ 10, syncOneCompany),
      runWithConcurrencyLimit(linkedinCompanies, /* concurrency */ 2, syncOneCompany),
    ]);

    // Every job actually created (not just updated) in this run, across all companies:
    const newJobsThisRun = [...ghResults, ...ashbyResults, ...leverResults, ...linkedinResults]
      .flatMap(r => r.newJobs);

    if (newJobsThisRun.length > 0) {
      await notifySubscribersOfNewJobs(newJobsThisRun); // §10.2
    }
  }
);
```
5-minute interval leaves comfortable buffer under the 10-minute requirement even accounting for function execution time and any transient retries. Doing the notification pass at the end of the *same* invocation (rather than a separate trigger) keeps "what's new this run" and "who gets a Discord alert about it" atomic and simple — no extra Firestore reads needed to figure out what changed. Webhook URLs live on each subscription doc (§5.5), so no Discord-related secrets need to be injected into this function's config (unlike an SMS provider).

### 6.2 Per-company sync (`syncOneCompany`)
1. Fetch from the appropriate source (§4.1 / §4.2) with a reasonable timeout (~10s). On failure:
   - **HTTP 429** → back off with jittered exponential delay (e.g. 1s → 2s → 4s, ± random jitter) and retry up to 2 more times before giving up for this run; record the failure on the `companies` doc (step 5 below) rather than throwing and aborting the whole batch.
   - **Network error / 5xx** → one immediate retry, then give up for this run.
   - **404** → don't retry (almost always means the board token is stale or the company switched ATS) — surface it via `lastSyncStatus`/`lastSyncError` for follow-up, not a transient-error retry loop.
   - Neither platform is expected to actually return 429 under this project's load (see §4.3) — this handling exists as cheap insurance, not because it's anticipated to trigger regularly.
2. Normalize each returned job into the `Job` shape (§5.2).
3. Batch-write (Firestore `WriteBatch`, ≤500 ops each) using `set(..., { merge: true })` on the deterministic doc ID:
   - If the doc doesn't exist yet → this is a **new posting**. Set `firstSeenAt = serverTimestamp()`, and include it in this call's returned `newJobs` array (used for notifications, §6.1).
   - If it exists → update mutable fields (title, description, location, salary may change) but **never overwrite `firstSeenAt`**. Update `lastSeenAt = serverTimestamp()`.
4. After processing the fetched list, diff against previously-active job IDs for that company still in Firestore but absent from this fetch → set `isActive = false`, `closedAt = serverTimestamp()`. (Don't delete — keeps history intact for jobs the user already marked Applied.)
5. Update the `companies/{id}` doc: `lastSyncedAt`, `lastSyncStatus: 'ok' | 'error'`, `lastSyncError` if applicable. A run of 4xx/404 usually means the board token changed or the company moved ATS — surfaced in the admin UI (§11) rather than failing silently.
6. Return `{ newJobs: Job[] }` to the caller so `syncJobBoards` can pass them straight into the notification pass without a re-query.

### 6.3 Location normalization (best-effort helper)
A small shared utility, e.g.:
```ts
function parseLocation(raw: string): Job['location'] {
  // "Remote" / "Remote - US" → isRemote: true, workplaceType: 'Remote'
  // "New York, NY" → city: "New York", state: "NY", country: "USA" (default US if 2-letter state code present)
  // "London, UK" → city: "London", country: "UK"
  // Anything unparseable → { raw, isRemote: false, workplaceType: 'Unknown' } — never throw
}
```
This doesn't need to be perfect — it feeds filter dropdowns, and the raw string is always shown and always preserved as a fallback.

---

## 7. Firestore Security Rules

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

    // Master company list — visible to signed-in users. Writes only ever come from
    // admin-only Cloud Functions using the Admin SDK (§11), never directly from the
    // client — so this stays `allow write: if false` even for admins.
    match /companies/{companyId} {
      allow read: if isSignedIn();
      allow write: if false;
    }

    // Normalized jobs — visible to signed-in users, never client-writable
    // (only the Cloud Function, using the Admin SDK, bypasses these rules).
    match /jobs/{jobId} {
      allow read: if isSignedIn();
      allow write: if false;
    }

    // Per-user applied/not-applied state — only the owner can read/write their own.
    match /users/{uid}/jobStatus/{jobId} {
      allow read, write: if isSignedIn() && request.auth.uid == uid;
    }

    // Per-user notification subscriptions — only the owner can read/write their own.
    // (Sending the actual Discord webhook POST still happens server-side, via the Admin SDK,
    // in the scheduled function — this rule only governs the user managing their own filter.
    // The discordWebhookUrl field is a credential; owner-only access is required.)
    match /users/{uid}/notificationSubscriptions/{subId} {
      allow read, write: if isSignedIn() && request.auth.uid == uid;
    }
  }
}
```

Note that `isAdmin()` is defined here for potential future use (e.g. if a later feature does want direct admin writes to some collection) but isn't currently referenced by any rule above, since company-list writes are intentionally funneled through Cloud Functions instead (§11) rather than opened up as direct Firestore writes — keeping the trust boundary in one place (server-side validation) rather than two.

## 8. Authentication & Authorization: Testing Mode → Locked-Down Mode

Requirement: use Firebase Auth, no hardcoded credentials, single user, can be public for now, and that one user should also be the admin.

**Phase A — Testing (now):** Enable Email/Password sign-in in the Firebase console. Ship a normal login + sign-up screen. Anyone who knows the URL could self-register, but there's nothing sensitive in the app itself (job postings are public information) — the security rules above already gate all *data access* behind `isSignedIn()`, and each user's applied-status and notification-subscription data is isolated to their own `uid`, so an extra test account can't see or corrupt your data, and can't touch the company master list (that requires the admin claim below regardless).

**Phase B — Lock sign-in to one user (when ready):** Two independent, non-hardcoded ways to restrict to just you, pick one:
1. **Simplest:** remove the public sign-up UI from the app (keep only a login form) and create your one account directly in the Firebase console (Authentication → Add user). No code ever contains your email/password.
2. **More robust:** Add an `admins/{uid}` allowlist collection (containing only your `uid`) and require it in the read/write rules above. This still allows the sign-up *form* to exist harmlessly, since unlisted accounts simply can't read/write anything.

**Phase C — Grant yourself the admin claim (needed for §11):** Custom claims can only be set server-side, never by a client, so this is a one-time script, not a UI action:
```ts
// scripts/set-admin-claim.ts (run locally with Admin SDK credentials, once, after you create your account)
import { getAuth } from 'firebase-admin/auth';
await getAuth().setCustomUserClaims(YOUR_UID, { admin: true });
```
After running this, sign out and back in (or call `getIdToken(true)` to force-refresh) so the new claim is present in your ID token. The admin-only Cloud Functions in §11 check this claim server-side on every call — it is never trusted from client-supplied data.

Either way, your actual email/password is never in source code — you create the account yourself via the Firebase console or the app's own sign-up form, and the admin claim is granted via a one-time script you run with your own credentials.

---

## 9. Frontend Architecture

### 9.1 Routes
| Route | Purpose |
|---|---|
| `/login` | Email/password sign-in + sign-up (Phase A) |
| `/` | Main job feed (protected) |
| `/applied` | Jobs you've marked Applied (protected) |
| `/notifications` | Manage Discord alert subscriptions — create/edit/pause/delete saved filters + webhook URLs (protected, §10) |
| `/admin/companies` | Add, edit, pause, and remove companies from the master list; view last sync status/errors per company (protected + admin-only, §11) |

### 9.2 Component sketch
```
src/
  auth/
    AuthContext.tsx        // wraps Firebase Auth state, exposes useAuth() including isAdmin from custom claims
    LoginPage.tsx
    ProtectedRoute.tsx
    AdminRoute.tsx           // wraps ProtectedRoute, additionally requires isAdmin
  jobs/
    JobFeedPage.tsx         // main page: filters + sorted list
    JobRow.tsx               // log-sheet row (not a card) — title, company, location, salary, apply, Applied toggle; see §9.6 / §9.7
    JobFilters.tsx           // layer-legend strip above the log (not a pill toolbar)
    useJobsQuery.ts          // Firestore onSnapshot hook + client-side filter/sort/pagination
    useJobStatus.ts          // reads/writes users/{uid}/jobStatus
    relevance.ts             // scoring function (see 9.4)
    locationOptions.ts        // derives distinct city/state/country values for filter dropdowns
  appliedPage/
    AppliedJobsPage.tsx
  notifications/
    NotificationsPage.tsx     // list of saved subscriptions + create/edit form
    SubscriptionForm.tsx      // Discord webhook URL input (masked display), filter fields
                              // (reuses JobFilters controls), "Test webhook" button
    useNotificationSubscriptions.ts // reads/writes users/{uid}/notificationSubscriptions
  admin/
    AdminCompaniesPage.tsx    // table of all companies + sync status
    CompanyForm.tsx            // add/edit a company, includes "Test connection" button
    useAdminCompanies.ts        // calls the admin callable Cloud Functions (§11)
  lib/
    firebase.ts               // Firebase app/config init (config values from env, not secrets — see §14)
packages/
  shared/
    jobFilter.ts                // matchesFilter(job, filter) — pure function, imported by both
                                  // src/jobs/useJobsQuery.ts (feed filtering) and
                                  // functions/src/notify.ts (notification matching), so the
                                  // two can never silently drift apart
```

### 9.3 Live updates
`JobFeedPage` subscribes with `onSnapshot` to a bounded query:
```ts
query(
  collection(db, 'jobs'),
  where('isActive', '==', true),
  orderBy('firstSeenAt', 'desc'),
  limit(500) // bounded window for V1; see §9.5 for scaling
)
```
Because this is a live listener, any job the sync function writes appears in the UI within seconds of the write — no polling from the client at all. Keyword/location filtering and sort happen client-side over this snapshot (see §9.4), which keeps the UI instant while the underlying data stays fresh.

### 9.4 Filtering, sorting, relevance
- **Keyword filter:** case-insensitive substring match against `title` (primary) and `descriptionPlain` (secondary). Empty input = no filter.
- **Location filter:** dropdowns/typeahead populated from distinct `location.city` / `location.state` / `location.country` values present in the current result set, plus a standalone "Remote only" toggle (`location.isRemote == true`).
- **Sort — Newest:** `firstSeenAt` descending (default).
- **Sort — Most Relevant:** only meaningful once a keyword is entered. Simple, explainable scoring:
  ```ts
  function relevanceScore(job: Job, keyword: string): number {
    const k = keyword.toLowerCase();
    let score = 0;
    if (job.title.toLowerCase() === k) score += 100;
    else if (job.title.toLowerCase().startsWith(k)) score += 60;
    else if (job.title.toLowerCase().includes(k)) score += 35;
    if (job.descriptionPlain.toLowerCase().includes(k)) score += 10;
    const hoursOld = (Date.now() - job.firstSeenAt.toMillis()) / 3.6e6;
    score += Math.max(0, 20 - hoursOld / 6); // small recency boost, decays over ~5 days
    return score;
  }
  ```
  This is intentionally simple and tunable rather than a black box — easy to adjust weights later.
- **The exact same `matchesFilter(job, filter)` predicate** (keyword + city/state/country + remoteOnly + optional companyIds) is what §10 uses server-side to decide which new jobs trigger a Discord alert — implemented once in `packages/shared/jobFilter.ts`, not reimplemented separately for notifications.

### 9.5 Scaling note (when to add Algolia/Typesense)
At the scale of a curated personal company list (tens to low hundreds of companies), the bounded-query + client-side-filter approach in §9.3 is simpler and cheaper than standing up a search service, and is the recommended V1 path. If the master list grows large enough that `limit(500)` starts clipping relevant older postings, add the **Firestore → Algolia** Firebase Extension (syncs `jobs` writes to an Algolia index automatically) and swap `useJobsQuery` to query Algolia instead of Firestore directly for the keyword/location filter — the rest of the UI is unaffected.

### 9.6 Job row contents (log entry, not a card)
Each job is a **horizontal log entry** on the Signal Log sheet (§9.7) — not a bordered/shadowed card. Contents: title (primary), company name, location (formatted from normalized fields, falling back to raw), salary (formatted range or "Not listed" in mono), a short description excerpt with "expand" for the full HTML description (sanitize with `DOMPurify` before rendering `descriptionHtml`), and a prominent "Apply" text-link/button (`applyUrl`, opens in new tab). Also shown: department/team, employment type, workplace type as plain labeled text (not pill chips), "Posted <date>" and "Found by JobRadar <relative time>" (from `firstSeenAt` — this is what makes "first to apply" tangible), and the Applied/Not Applied toggle. A left-margin **signal pip** marks entries firstSeen within the last ~2 hours.

### 9.7 Visual Design System — "Signal Log"

**Concept:** JobRadar is not a job marketplace and must not look like one. The UI is a **live signal log** — the desk of someone plotting new openings the way a surveyor plots fixes on a field sheet, or a watch officer logs contacts. Dense, precise, slightly industrial, light-on-paper. The brand promise ("you're early") is felt as *pings arriving on a sheet*, not as a dashboard of product cards.

**Name to use in code comments / token files:** `signal-log`.

#### Direction (one sentence)
Cool mineral paper, deep ink, a single **signal-ochre** accent for "new," condensed irregular grotesk for the wordmark, technical sans + mono for the log — continuous ruled rows, no card grid, no purple, no glow.

#### CSS variables (source of truth — put in `:root` / Tailwind theme extension)

```css
:root {
  /* Surfaces */
  --paper:        #D7E0DB;   /* cool mineral green-gray — NOT warm cream */
  --paper-2:      #C9D5CF;   /* recessed / filter strip / alternate row wash */
  --ink:          #101C1F;   /* near-black teal ink */
  --ink-muted:    #3D5250;   /* secondary labels, meta */
  --rule:         #8FA39B;   /* spine + hairline rules */
  --rule-faint:   #B7C6C0;   /* row separators */

  /* Signal language */
  --signal:       #C8960A;   /* ochre — "new ping", primary CTA fill, focus ring */
  --signal-ink:   #1A1400;   /* text on signal fills */
  --fix:         #155E52;   /* Apply links, success/sync-ok — deep sea green */
  --fault:        #9E2F22;   /* sync errors only — sparingly */

  /* Derived */
  --focus-ring:   var(--signal);
  --row-hover:    color-mix(in srgb, var(--paper-2) 70%, var(--signal) 8%);
}
```

Do not invent additional accent colors. If something isn't ink, signal, sea, or fault, it's wrong for this system.

#### Typography

| Role | Face | Notes |
|---|---|---|
| Brand / display | **Bricolage Grotesque** (weights 600–800) | Slightly uneven, condensed — distinctive without being costume. Load from Google Fonts or Fontshare. **Never** Inter, Roboto, Arial, system-ui, Space Grotesk, or Geist for brand. |
| UI / body | **IBM Plex Sans** | Technical, readable at dense sizes; pairs with the log metaphor. |
| Data / meta | **IBM Plex Mono** | Timestamps, salaries, board tokens, sync status, webhook masks, `firstSeenAt` relatives. |

Scale (approx.): brand on login ~48–64px; in-app wordmark ~20–22px; job title ~17–18px semibold Plex Sans; meta ~12–13px mono; body/excerpt ~14px Plex Sans. Tight tracking on the wordmark (−0.02em); normal elsewhere. Avoid oversized marketing headlines inside the authenticated app — density is the point.

#### Brand treatment
- Wordmark is always **JobRadar** in Bricolage Grotesque — never reduced to an icon-only mark in the first viewport of `/login`.
- The **O** in "JobRadar" (or a trailing mark after the word) contains a small **sector arc** (a 90° radar-sweep stroke in `--signal` or `--ink`) — a 2-stroke SVG, not an emoji, not a glow orb.
- Login (`/login`): one composition — cool paper field, faint azimuth/compass construction lines in the background (CSS or a single inline SVG, opacity ~0.12), **JobRadar** as the hero-scale brand, one short line ("New postings, logged within minutes."), one CTA group (email/password). No feature grid, no stats strip, no floating badges.
- Authenticated chrome: compact wordmark top-left + text nav (Feed / Applied / Alerts / Admin). No rounded-full avatar pills; keep chrome quiet so the log is the visual center.

#### Layout grammar (anti-card)
- **Default: no cards.** Job entries are rows on a continuous sheet with:
  - A vertical **spine rule** ~48–64px from the left edge.
  - A **time gutter** left of the spine: mono relative time + signal pip for fresh entries.
  - Content to the right of the spine: title · company · location · salary on one primary line; meta and excerpt below; Apply + Applied controls trailing or on a second line on narrow screens.
- Row separators are 1px `--rule-faint` hairlines — not shadows, not bordered tiles, not 16px-radius panels.
- Filters are a **legend strip** pinned above the log (label "Layers" or unlabeled): keyword field, location selects, remote toggle, sort — flat on `--paper-2`, separated by hairlines. Toggle states use underline/ochre tick marks, **not** pill chips or rounded-full segments.
- Admin company table and notifications list follow the same sheet grammar (ruled rows). Forms use underlined or ruled inputs, not heavy outlined material boxes.

#### Signal language (how "new" feels)
- **Pip:** 6–8px diamond or crosshair in the gutter, filled `--signal`, only when `firstSeenAt` is within ~2 hours (tunable). Older rows: empty or absent.
- **Found by JobRadar:** always shown in mono as a relative time — this is the product's emotional hook; don't bury it.
- **Applied:** toggle that stamps the row — e.g. a small ink "FILED" mark or a struck-through title treatment + move-to-Applied — not a green soft-badge pill.
- **Sync fault** (admin): `--fault` text inline next to the company row; no toast carnival.

#### Motion (ship these three; no more required)
1. **Ping-in:** when a new row arrives via `onSnapshot`, the gutter pip scales 0→1 and a short 90° sector arc sweeps once (~180–220ms, ease-out) beside it — literal "radar contact," then still.
2. **Row draw:** new/entering rows ease in from the spine (translateX 8–12px + opacity), ~150ms — like a pen line committing to the sheet.
3. **Apply hover:** the Apply control's underline draws left→right in `--fix` (~120ms).

Respect `prefers-reduced-motion: reduce` (skip sweep/draw; keep opacity only).

#### Atmosphere (background)
- Base fill `--paper`. Optional subtle noise (~2–3% opacity) or a faint **registration grid** (wide spacing, `--rule-faint`) — enough to kill flat flatness, not enough to read as texture wallpaper.
- Login may use a larger faint azimuth rose / concentric arcs behind the brand (SVG, ink at ~8–12% opacity). Authenticated feed: quieter — grid or none, so the log stays primary.
- Do **not** use purple gradients, mesh blobs, glassmorphism, or full-bleed stock photography.

#### Explicit anti-patterns (reject in review)
- Purple / indigo gradients; glow; neon dark mode; glassmorphism.
- Warm cream + terracotta + big serif (the common "editorial AI" look).
- Broadsheet / dense newspaper columns with hairline-only chrome as the whole identity.
- Card grids, soft multi-layer shadows, rounded-full filter pills, emoji as UI.
- Inter / Roboto / system / Space Grotesk / Geist as the brand face.
- Dashboard stat strips on the feed ("12 new · 40 companies · …") competing with the log.
- Inset hero media cards on `/login`.

#### Tailwind mapping (implementation hint)
Extend the Tailwind theme with the CSS variables above (`colors.paper`, `colors.ink`, `colors.signal`, etc.). Use `font-brand` → Bricolage, `font-sans` → Plex Sans, `font-mono` → Plex Mono. Prefer utility compositions that produce ruled rows (`border-rule-faint`, gutter width) over component libraries that default to Card.

#### Reference feel (for the implementing agent)
If the first viewport of the feed could be mistaken for Linear, Ashby, Greenhouse, or a generic "AI SaaS starter," the design has drifted — pull back toward **ruled paper, ochre pips, Bricolage wordmark, mono timestamps**. If `/login` still looks branded after removing the nav chrome, the brand treatment is strong enough.

---
## 10. Notification Subscriptions (Discord)

### 10.1 User-facing flow
On `/notifications`, the user creates one or more saved filters (same fields as the feed's filter controls — keyword, city/state/country, remote-only, optional company list), pastes a Discord Incoming Webhook URL for the channel that should receive alerts, and saves. This writes a `NotificationSubscription` doc (§5.5) directly from the client — the security rule already allows the owner to read/write their own subdocs, and this is just saving a filter + destination URL, not an action that needs server-side validation the way admin writes do.

How to get a webhook URL (one-time, in Discord — free):
1. Create a Discord server (or use an existing one) and a channel, e.g. `#job-alerts`. A private server with only you in it is ideal for personal alerts.
2. Channel Settings → Integrations → Webhooks → New Webhook. Name it something like "JobRadar", optionally set an avatar, then **Copy Webhook URL**.
3. Paste that URL into the JobRadar subscription form. Enable Discord mobile/desktop notifications for that channel so alerts actually interrupt you.

Webhook URL handling:
- Validate client-side that the URL matches `https://discord.com/api/webhooks/` or `https://discordapp.com/api/webhooks/` before saving.
- Display a masked version after save (e.g. show only the webhook id prefix + dots for the token) so the full secret isn't sitting in plain text on screen.
- Optional **"Test webhook"** button: POSTs a harmless `{"content": "JobRadar test — webhook connected ✅"}` from the client (or via a tiny callable function) so the user confirms the channel receives it before relying on the sync.
- No carrier/SMS consent checkbox is needed — this is the user posting into *their own* Discord channel via a webhook they created. Pause/delete in JobRadar (or delete the webhook in Discord) is the unsubscribe path.

### 10.2 Matching & sending (server-side)
At the end of every `syncJobBoards` run (§6.1), if `newJobsThisRun.length > 0`:
1. Run a Firestore **collection-group query**: `collectionGroup('notificationSubscriptions').where('active', '==', true)` to get every active subscription across all users in one read.
2. For each subscription, filter `newJobsThisRun` through the shared `matchesFilter(job, subscription.filter)` predicate (§9.4/§9.2).
3. If one or more jobs match, compose **one consolidated Discord message per subscription** (never one message per job — avoids flooding the channel if 5 matching roles post in the same 5-minute window). Prefer a simple embed (or plain Markdown content) along the lines of:
   ```
   **JobRadar — 3 new matches** for "software engineer" in NYC
   • **Stripe** — Backend Engineer
   • **Ramp** — SWE II
   • **Notion** — Senior SWE
   [Open feed](https://your-app.web.app/?utm=discord)
   ```
   Cap the listed jobs at ~10 (Discord allows up to 2000 characters of `content`, and embeds have their own field limits — either is fine at this volume). Include `applyUrl` as a Markdown link per job when space allows.
4. Send with a plain HTTP `POST` to `subscription.discordWebhookUrl`:
   ```ts
   await fetch(subscription.discordWebhookUrl, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ content: messageText }), // or { embeds: [...] }
   });
   ```
   No Discord bot token, no OAuth, no SDK required — Incoming Webhooks are intentionally this simple.
5. Update `lastNotifiedAt` on the subscription doc.
6. Handle send failures per-subscription (don't let one bad webhook abort the whole batch):
   - **HTTP 404 / 401** → the webhook was deleted or regenerated in Discord; set that subscription's `active = false` and surface "Webhook invalid — recreate in Discord and update this subscription" on `/notifications`.
   - **HTTP 429** → Discord rate-limited this webhook (roughly on the order of ~30 messages/minute per webhook — far above personal alert volume). Respect `retry_after` / `X-RateLimit-Reset-After` if present; one short retry is enough. Do **not** deactivate the subscription on a transient 429.
   - Network / 5xx → log and skip this run; leave `active` alone.

### 10.3 Why matching happens server-side, not client-side
Discord doesn't need the JobRadar site open to receive a channel message — the whole point is "notify me even when I'm not looking." That means matching and sending must happen wherever the sync itself runs (the scheduled Cloud Function), not in the browser. Phone push then comes from the Discord mobile app's own notification settings for that channel.

### 10.4 Cost & caveats — Discord Incoming Webhooks are free
Unlike Twilio SMS (paid number + per-segment fees) or Meta WhatsApp Cloud API (developer/test-tier limits, phone verification, Graph API setup), **Discord Incoming Webhooks are free for this project's shape**:
- Creating a Discord account, server, channel, and Incoming Webhook costs **$0**. No paid Discord plan (Nitro, Server Boost, etc.) is required for webhook posting or for receiving mobile push notifications.
- There is **no per-message charge**. Discord does not bill for Incoming Webhook executions.
- There is **no Twilio / Meta / BSP account**, no phone number to buy, no A2P 10DLC registration, and no carrier fees.
- Rate limits exist (~30 messages per minute per webhook is the commonly cited ceiling; always honor 429 + `retry_after`) but personal job-alert volume (a handful of consolidated messages per day) is nowhere near them.
- Setup is ~2 minutes: Channel Settings → Integrations → Webhooks → Copy URL. No Discord Developer Portal application is required for send-only Incoming Webhooks.

**Honest caveats (still free, but know them):**
- You need the **Discord app** (or Discord in a browser) with notifications enabled for the alert channel — this is not carrier SMS, so if Discord is muted or the phone has Discord notifications off, you won't feel the alert.
- The webhook URL is a **secret** equivalent to a write credential for that channel. Store it only in the owner-scoped Firestore subdoc (§5.5/§7); if leaked, delete/regenerate the webhook in Discord.
- Incoming Webhooks are **one-way** (JobRadar → Discord). There is no built-in "reply STOP to unsubscribe" — unsubscribe is pause/delete in `/notifications`, or delete the webhook in Discord. A full Discord bot (for DMs, slash commands, buttons) is explicitly out of scope for V1 (§1 Non-Goals).
- Discord's free tier and webhook product have been stable and free for years, but like any third-party platform, terms can change; at personal volume there is no plausible paid-upsell pressure for this use case.

---

## 11. Admin: Master Company List Management (website-based)

### 11.1 Why Cloud Functions instead of direct Firestore writes
The `companies` collection stays `allow write: if false` for every client, admin included (§7). Instead, all mutations go through **admin-only callable Cloud Functions**, which:
- Check `context.auth.token.admin === true` on the server before doing anything (client-supplied claims are never trusted — this is the actual security boundary, not a UI-level check).
- Reuse the exact same fetch/normalize functions the sync engine already has for Ashby/Greenhouse, so a "test this board token before saving" feature (below) is close to free to build, and so there's only one implementation of "how do we talk to Ashby/Greenhouse" in the whole codebase.

### 11.2 Callable functions
```ts
// functions/src/admin.ts
adminTestCompanyBoard({ ats, boardToken }) 
  // → { ok: true, jobCount: number, sampleTitles: string[] } | { ok: false, error: string }
  // Does a single live fetch (reusing the same fetchAshby/fetchGreenhouse used in §6.2) —
  // WITHOUT writing anything — so a typo'd board token is caught immediately in the UI
  // instead of silently surfacing as a 404 on the next scheduled sync.

adminUpsertCompany({ id, name, ats, boardToken, careersUrl?, active })
  // → validates required fields, writes/updates the companies/{id} doc via the Admin SDK,
  //   sets createdAt (new) or updatedAt (existing), createdBy = admin uid.

adminSetCompanyActive({ id, active })
  // → quick pause/resume toggle without re-submitting the whole form.

adminDeleteCompany({ id })
  // → deletes the companies/{id} doc. Existing job postings from that company are left as-is
  //   (isActive stays whatever it last was) rather than deleted, since a user may have marked
  //   one of them Applied — they simply stop being refreshed by future syncs. A "delete this
  //   company's inactive jobs too" checkbox is a reasonable nice-to-have, not required for V1.
```
Every one of these throws an `unauthenticated`/`permission-denied` error immediately if the caller's token doesn't have `admin: true` — this is the actual enforcement point, not the frontend route guard (`AdminRoute` in §9.2 is a UX nicety so a non-admin never even sees the form; it is not the security boundary).

### 11.3 Admin UI (`/admin/companies`)
- Table of every company: name, ATS badge, board token, active/paused toggle, `lastSyncedAt`, `lastSyncStatus` (with `lastSyncError` shown inline when it's `'error'` — this is exactly where you'd notice "Company X's board token needs updating" without digging through logs).
- "Add company" opens `CompanyForm`: name, ATS select (Ashby/Greenhouse), board token, optional careers URL. A **"Test connection"** button calls `adminTestCompanyBoard` and shows "✅ Found 42 open roles, e.g. 'Software Engineer', 'Product Manager'…" or the specific error, before the Save button is enabled — catching a mistyped slug at entry time instead of finding out five minutes later when the next sync logs a 404.
- Edit/pause/delete actions on each row call the corresponding function from §11.2.
- This page fully replaces the *ongoing* need to hand-edit Firestore or re-run a seed script after initial setup (§13 remains useful for the one-time bulk import of your first company list, but day-to-day additions/removals happen here).

---

## 12. Applied / Not Applied Tracking
- Toggle button on every `JobRow` and in the `/applied` page.
- Writes to `users/{uid}/jobStatus/{jobId}` via `setDoc(..., { merge: true })`.
- `useJobStatus` hook subscribes to the whole `jobStatus` subcollection once per session (small dataset) and exposes a `Map<jobId, status>` so every row can look up its state without a per-row listener.
- Feed page filter: "Hide applied" toggle (default on) so the main feed emphasizes what's left to do.

---

## 13. Master List Seeding (initial bulk import only)
A one-time (and re-runnable) script, not part of the deployed app, used to bootstrap the master list before the admin UI (§11) exists or when importing a large batch at once:
```
scripts/seed-companies.ts
```
Reads a local `companies.json` like:
```json
[
  { "id": "anthropic", "name": "Anthropic", "ats": "greenhouse", "boardToken": "anthropic" },
  { "id": "deshaw", "name": "D. E. Shaw", "ats": "greenhouse", "boardToken": "deshaw" },
  { "id": "example-ashby-co", "name": "Example Co", "ats": "ashby", "boardToken": "examplecoslug" }
]
```
...and upserts each into `companies/{id}` via the Admin SDK, setting `active: true`, `createdAt: serverTimestamp()`. Re-running is safe (idempotent upsert). Once §11's admin UI is live, ongoing add/edit/pause/remove happens there instead — this script is for the initial batch load (or a rare future bulk re-import), not routine maintenance.

---

## 14. Environment Variables & Secrets
No API keys are needed for Ashby/Greenhouse reads (public endpoints) and no credentials are hardcoded for auth (Firebase Auth handles that). Discord Incoming Webhook URLs are secrets, but they are stored **per subscription in Firestore** (owner-scoped, §5.5/§7) rather than as Cloud Function config secrets — so there is no Twilio-style third-party API key to put in Secret Manager for V1:

| Variable | Where | Purpose |
|---|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, etc. | `.env` (frontend build) | Firebase web app config (these are not secret — they're safe to ship in a client bundle, but still keep them in `.env` rather than inline for cleanliness) |
| `discordWebhookUrl` on each `notificationSubscriptions` doc | Firestore (owner-only rules) | Destination for that subscription's Discord alerts; the URL *is* the credential — never log it in full, never commit it |
| Firebase Admin credentials for `scripts/seed-companies.ts` and `scripts/set-admin-claim.ts` | local only, via `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service-account JSON, or `firebase login` + default app credentials | Never commit the service account key |

Cloud Functions use the Admin SDK's default credentials automatically inside the Firebase environment for Firestore access — nothing to configure there. No Discord bot token or OAuth client is required for Incoming Webhooks. If a future version switches to a Discord bot (DMs, slash commands), that bot token would go in Firebase Functions secrets (`defineSecret`) — out of scope for V1.

---

## 15. Deployment
1. `firebase init` (Hosting, Functions, Firestore) in a fresh Firebase project.
2. Firestore: publish the security rules from §7, and create composite indexes as needed — Firebase will emit a direct console link to create the exact index the first time a query like `where('isActive','==',true).orderBy('firstSeenAt','desc')` or the §10.2 collection-group query runs without one; follow it.
3. In Discord: create (or reuse) a server + `#job-alerts` channel, create an Incoming Webhook, copy the URL — you'll paste it into `/notifications` after the app is live (§10.1). No Discord Developer Portal app and no paid Discord plan needed.
4. `firebase deploy --only functions` for the scheduled sync function and the admin callable functions (this auto-provisions the underlying Cloud Scheduler job and Pub/Sub topic — no manual Cloud Scheduler setup needed).
5. `npm run build && firebase deploy --only hosting` for the React app.
6. Run `scripts/seed-companies.ts` once against the deployed project to populate the initial master list.
7. Create your one user (console or sign-up form, per §8), then run `scripts/set-admin-claim.ts` against your `uid` so `/admin/companies` is usable.
8. Sign in → `/notifications` → create a subscription with your Discord webhook URL → use **Test webhook** to confirm a message lands in the channel.

---

## 16. Suggested Implementation Order (for Cursor)

**Phase 0 — Scaffold**
Firebase project, `firebase init`, npm-workspaces layout (`apps/web`, `functions`, `packages/shared`), Vite+React+TS app skeleton, Tailwind with **Signal Log** tokens and fonts wired from day one (§9.7), Firestore rules file (locked down from day one, per §7).

**Phase 1 — Sync engine first (prove the hardest part early)**
Implement `syncOneCompany` for Greenhouse and Ashby, deploy as an `onSchedule` function, seed 2-3 real companies, verify jobs land correctly in Firestore with the shapes in §5.2. Manually trigger once via `firebase functions:shell` or a temporary `onRequest` wrapper before wiring the schedule.

**Phase 2 — Auth**
Firebase Auth login/sign-up screens, `ProtectedRoute`, `AuthContext` (including reading the `admin` custom claim from the ID token for later use).

**Phase 3 — Feed**
`useJobsQuery` with the bounded live query (§9.3), `JobRow` as a ruled log entry (§9.6/§9.7), basic unfiltered/unsorted list rendering real data end-to-end. Extract `matchesFilter` into `packages/shared/jobFilter.ts` from the start so Phase 7 can import it rather than duplicating it later.

**Phase 4 — Filters & sort**
Keyword, location, remote toggle, Newest/Most Relevant (§9.4) as a legend strip per §9.7 — not pill chips.

**Phase 5 — Applied tracking**
`jobStatus` subcollection, toggle UI, `/applied` page, "Hide applied" filter.

**Phase 6 — Admin: master company list on the website**
`scripts/set-admin-claim.ts`, `AdminRoute`, the three-plus admin callable functions (§11.2), `AdminCompaniesPage` + `CompanyForm` with the "Test connection" button. This unblocks you from ever needing direct Firestore console access again.

**Phase 7 — Discord notification subscriptions**
Create a Discord channel + Incoming Webhook (§10.1), `NotificationSubscription` CRUD from the client (webhook URL + filter), the matching-and-sending step wired into the end of `syncJobBoards` (§10.2) as a plain HTTP POST to the webhook URL. Test end-to-end with your own webhook and a manually-triggered sync before trusting the schedule.

**Phase 8 — Polish (Signal Log)**
Apply the full §9.7 system: Bricolage wordmark + sector arc, legend-strip filters, signal pips + ping-in motion, salary/mono formatting, description HTML sanitization + expand/collapse, empty/loading states on paper (not skeleton cards), mobile ruled-row layout.

**Phase 9 — Deploy & seed real master list**
Full company list added via the admin UI (§11) or the bulk seed script (§13), verify first live "new job" appears within the 10-minute window end-to-end, and confirm a real Discord message arrives in the subscribed channel for a matching subscription.

---

## 17. Testing Notes
- Unit test the Ashby/Greenhouse normalizers against saved fixture JSON responses (capture one real response from each source during Phase 1 and commit as a fixture) — this is the highest-value test surface, since it's the part most likely to break silently when a company changes ATS config.
- Test the "new vs. update vs. closed" upsert logic with a fixture sequence: run 1 introduces jobs A, B; run 2 has A, C (B disappeared, C is new) — assert A unchanged (`firstSeenAt` preserved), B marked inactive, C created with fresh `firstSeenAt`.
- Unit test `matchesFilter` in `packages/shared` directly — since it's imported by both the feed and the notification pass, a bug here silently affects two features at once, making it worth extra coverage (keyword edge cases, remote-only, empty filter = match everything).
- Test the notification pass with a fixture: given a set of `newJobsThisRun` and a set of subscriptions, assert the right subset of subscriptions would be notified, and that the message batches multiple matches into one send rather than one-per-job. Mock `fetch` to the Discord webhook URL in this test — don't POST to a real webhook in CI.
- Test that the admin callable functions reject a caller without the `admin` claim (this is the actual security boundary — verify it directly rather than only testing the happy path).
- Manual end-to-end check post-deploy: temporarily lower the schedule to `every 2 minutes`, watch a known company's board, confirm a real new posting appears in the UI without a page refresh, and — if a matching subscription exists — that a real Discord message arrives in the channel.

## 18. Open Assumptions
Documented here rather than left implicit, so they're easy to revisit:
- Assumed you'll maintain the initial company → board-token list yourself (no discovery/crawling of "which companies use Ashby/Greenhouse" — that's a different, much larger problem); ongoing changes go through the admin UI in §11.
- Assumed 500 active jobs is a reasonable bounded window for V1 given a curated (not massive) company list; revisit per §9.5 if not.
- Assumed no need to preserve full historical/closed job data forever — closed jobs are kept (not deleted) but could be pruned with a periodic cleanup function later if the collection grows large.
- Assumed you're comfortable creating a free Discord account/server/channel and pasting an Incoming Webhook URL into JobRadar (§10.4) — this project delivers alerts at $0 this way, unlike SMS.
- Assumed "admin" means exactly one person (you) for V1 — the custom-claim approach in §8/§11 generalizes to multiple admins later (just grant the claim to more than one uid) without any rule or function changes.
- Assumed Discord mobile/desktop notifications for the alert channel are enabled on your devices — JobRadar can only POST to the webhook; actual "interrupt me" behavior is Discord's notification settings.
