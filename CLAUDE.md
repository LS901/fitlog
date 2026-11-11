@AGENTS.md

# Fitlog

Personal workout / body-stats / vitals tracker. Replaces the owner's PT app (ExpertPT, a Trainerize-style
white-label app) after he stops that service. Local-first PWA; the owner is a frontend dev (React, TS, Next.js,
Tailwind), so keep the code idiomatic and conventional.

## Commands
- `npm run dev` – dev server (http://localhost:3000)
- `npm run build && npm start` – production build (the service worker only registers in production)
- `npm test` – Vitest unit tests (`src/**/*.test.ts`, node environment, pure functions only)
- `npx tsc --noEmit`, `npx eslint src` and `npm test` – must all be clean before committing
- Fresh clone: `npx next typegen` (or any dev/build) before `tsc`, or `LayoutProps` is missing

## Architecture
- Next.js 16 App Router, React 19, TypeScript, Tailwind 4. No UI library; shared bits in `src/components/ui.tsx`.
- **All user data lives in the browser** (IndexedDB via Dexie, `src/lib/db.ts`). No server database.
  Tables: `measurements` (unified: type/date/value/source/ext), `sessions`, `programmes`, `photos` (Blobs),
  `settings` (key/value; key `goals` holds goal weight + daily calorie/macro targets, see `getGoals`/`useGoals`),
  `nutrition` (one row per local day: calories/protein/carbs/fat + source; see `src/lib/nutrition.ts`).
- `Shell` renders page content **client-side only** (`useSyncExternalStore` isClient gate). This is deliberate:
  Next 16 rejects `new Date()` during prerender and there is nothing useful to SSR. Keep it that way.
- Programmes use a plain-text format parsed in `src/lib/measures.ts` (`# Day`, `Name 4x6 rest 90s (note)`,
  `+` line = superset with the line above, `Rowing 4min` = duration). `programmeToText` must round-trip.
- Seed programme (ExpertPT Phase 6, 2 Nov – 27 Dec 2026; odd weeks volume, even weeks heavy) is in `src/lib/seed.ts`.
- Exercise how-to: `src/lib/exercises.ts` + `src/data/exercises.json` + `public/exercises/*.jpg` (photos and instructions from the
  public-domain free-exercise-db, hand-mapped to the seeded programme's names; `approx` marks a similar-but-not-identical
  exercise). Tapping the thumbnail on a session card opens `ExerciseModal`. Video: YouTube search link, or a user-pasted
  YouTube/Vimeo link stored in `settings` (`exerciseVideos`). Unknown exercises get no description but keep the video options.
- Withings: OAuth2 + measure sync run in route handlers (`src/app/api/withings/*`, `src/lib/withings.ts`);
  tokens are httpOnly cookies; client pulls rows and writes them to Dexie, de-duplicating on `ext`.
  Needs `WITHINGS_CLIENT_ID/SECRET/REDIRECT_URI` in `.env.local` (see `.env.example`).
- CSV import (`parseMeasurementCsv`) accepts a Date column plus Weight / Fat % / Lean mass / Heart rate / etc.
- Google Health / Health Connect has no web API; Withings already syncs into it, so read from Withings instead.

## Privacy rules
- Never commit personal data. `/data/` and `.env*` (except `.env.example`) are gitignored.
- Don't hard-code the owner's measurements, goals or photos in source. Goals and targets are user-editable settings.

## Roadmap (not built yet)
1. ~~**Nutrition + MyFitnessPal.**~~ Done: `/nutrition` page (intake vs target, 7-day average, calories chart), manual
   entry and a tolerant CSV importer (`parseNutritionCsv`) for MFP's "Download Your Data" export. The export's exact
   column layout isn't documented, so the parser finds columns by name and sums rows per day (a dated "Totals" row wins).
   Why not an API: ExpertPT/Trainerize syncs MFP through a commercial partner integration (MFP's partner API); we found
   no way for an individual to get those credentials. Don't scrape or ask for MFP passwords. Possible later: an iOS
   Shortcut / Health Connect export (MFP writes nutrition there) imported as a file; `NutritionDay.source` can grow.
2. ~~**Goals.**~~ Done: editable in Settings, stored in Dexie `settings`; goal line + % progress on Body.
3. ~~**Charts.**~~ Done in `MetricPanel` (Body + Vitals): 3M/6M/1Y/All chips, dashed weekly-average overlay (charts with
   1-2 series only), collapsible weekly-average list. Pure helpers in `src/lib/series.ts`.
4. ~~**Per-exercise progress + PR badges.**~~ Done: `/workouts/exercise?name=` (est. 1RM + top-set chart, volume chart,
   range chips, best set, per-session history; reps/minutes instead for bodyweight or timed work), linked from the PB
   list, each session card ("Progress →") and the how-to modal. Session cards badge the set that beats every earlier
   session's best e1rm (`prSetIndexes`; never on an exercise's first appearance). Per-exercise notes live on
   `SessionEntry.memo` and the latest earlier one shows as "Last note" (`previousMemo`). Session-level notes already existed.
5. Photos: bulk import from camera roll with date from EXIF, front/side/back tabs.
6. ~~**Tests.**~~ Done: Vitest for the programme parser (incl. seed round-trip), measurement + nutrition CSV parsers,
   `series` helpers and workout logic (`computePRs`, `exerciseHistory`, `prSetIndexes`, `previousMemo`). Keep new
   logic in pure functions in `src/lib` so it stays testable without IndexedDB.
