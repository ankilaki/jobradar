# JobRadar

Personal Ashby/Greenhouse job-board monitor with Discord alerts and a **Signal Log** UI. Full design: `JobRadar_PROJECT_DESIGN.md`.

## Workspace

```
apps/web          React + Vite + Tailwind (Signal Log)
functions         Firebase Cloud Functions (sync + admin + Discord notify)
packages/shared   Shared matchesFilter helper
scripts/          seed-companies.ts, set-admin-claim.ts
```

## Quick start

```bash
npm install
cp .env.example apps/web/.env
# Fill VITE_FIREBASE_* from your Firebase project console
npm run dev
```

## Phase status (implemented)

| Phase | Status | How it was tested |
|---|---|---|
| 0 Scaffold | Done | `npm run build`, Signal Log tokens/fonts |
| 1 Sync engine | Done | Unit + live Ashby/Greenhouse fetch tests |
| 2 Auth | Done | Typecheck/build; needs Firebase env for live login |
| 3 Feed | Done | Build; live needs seeded Firestore jobs |
| 4 Filters/sort | Done | Shared `matchesFilter` + relevance unit tests |
| 5 Applied | Done | Build/typecheck |
| 6 Admin | Done | Admin claim gate unit tests; callables in functions |
| 7 Discord alerts | Done | Webhook POST + message format unit tests |
| 8 Polish | Done | DOMPurify, motions, legend strip, BrandMark |

## Firebase setup (required for live end-to-end)

1. Create a Firebase project (Blaze plan for scheduled functions).
2. Enable **Authentication → Email/Password**, **Firestore**, **Functions**, **Hosting**.
3. Put the web config in `apps/web/.env`.
4. Set `.firebaserc` project id.
5. `firebase deploy --only firestore:rules,firestore:indexes,functions,hosting`
6. `npx tsx scripts/seed-companies.ts`
7. Create your user in the app, then `USER_UID=... npx tsx scripts/set-admin-claim.ts`
8. Trigger a sync: call the `syncJobBoardsManual` HTTPS function URL, or wait for the hourly schedule.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Web app |
| `npm run build` | Shared + web production build |
| `npm run build:functions` | Compile Cloud Functions |
| `npm test` | All workspace unit tests |
| `npm run typecheck` | Typecheck all packages |
