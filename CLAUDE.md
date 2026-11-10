@AGENTS.md

# Fitlog

Personal workout / body-stats / vitals tracker. Replaces the owner's PT app (ExpertPT, a Trainerize-style
white-label app) after he stops that service. Local-first PWA; the owner is a frontend dev (React, TS, Next.js,
Tailwind), so keep the code idiomatic and conventional.

## Commands
- `npm run dev` – dev server (http://localhost:3000)
- `npm run build && npm start` – production build (the service worker only registers in production)
- `npx tsc --noEmit` and `npx eslint src` – must both be clean before committing

## Architecture
- Next.js 16 App Router, React 19, TypeScript, Tailwind 4. No UI library; shared bits in `src/components/ui.tsx`.
- **All user data lives in the browser** (IndexedDB via Dexie, `src/lib/db.ts`). No server database.
  Tables: `measurements` (unified: type/date/value/source/ext), `sessions`, `programmes`, `photos` (Blobs).
- `Shell` renders page content **client-side only** (`useSyncExternalStore` isClient gate). This is deliberate:
  Next 16 rejects `new Date()` during prerender and there is nothing useful to SSR. Keep it that way.
- Programmes use a plain-text format parsed in `src/lib/measures.ts` (`# Day`, `Name 4x6 rest 90s (note)`,
  `+` line = superset with the line above, `Rowing 4min` = duration). `programmeToText` must round-trip.
- Seed programme (ExpertPT Phase 6, 2 Nov – 27 Dec 2026; odd weeks volume, even weeks heavy) is in `src/lib/seed.ts`.
- Withings: OAuth2 + measure sync run in route handlers (`src/app/api/withings/*`, `src/lib/withings.ts`);
  tokens are httpOnly cookies; client pulls rows and writes them to Dexie, de-duplicating on `ext`.
  Needs `WITHINGS_CLIENT_ID/SECRET/REDIRECT_URI` in `.env.local` (see `.env.example`).
- CSV import (`parseMeasurementCsv`) accepts a Date column plus Weight / Fat % / Lean mass / Heart rate / etc.
- Google Health / Health Connect has no web API; Withings already syncs into it, so read from Withings instead.

## Privacy rules
- Never commit personal data. `/data/` and `.env*` (except `.env.example`) are gitignored.
- Don't hard-code the owner's measurements, goals or photos in source. Goals and targets are user-editable settings.

## Roadmap (not built yet)
1. **Nutrition + MyFitnessPal.** ExpertPT also links to MyFitnessPal for food logging. MFP has no public API for
   personal use (as far as we found), so: import MFP's "Download Your Data" export (settings → Account on the web
   site; contains diary entries and daily totals) as CSV, store daily calories/protein/carbs/fat, show intake vs
   targets and 7-day averages. Manual entry as a fallback. Don't scrape or ask for MFP passwords.
2. **Goals.** Editable goal weight (shown as a line on the weight chart plus % progress) and daily calorie/macro
   targets, stored locally.
3. **Charts.** 3M / 6M / 1Y range chips, weekly-average overlay, weekly-average list under each chart.
4. Per-exercise progress charts, edit past sessions, workout notes/PR badges in the session UI.
5. Photos: bulk import from camera roll with date from EXIF, front/side/back tabs.
6. Tests (Vitest) for the programme parser, CSV parser and `computePRs`.
