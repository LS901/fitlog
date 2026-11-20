@AGENTS.md

# Fitlog

Personal workout / body-stats / vitals tracker. Replaces the owner's PT app (ExpertPT, a Trainerize-style
white-label app) after he stops that service. Local-first PWA; the owner is a frontend dev (React, TS, Next.js,
Tailwind), so keep the code idiomatic and conventional.

## Commands
- `npm run dev` – dev server (http://localhost:3000)
- `npm run build && npm start` – production build (the service worker only registers in production)
- `npm test` – Vitest unit tests (`src/**/*.test.ts`, node environment). Mostly pure functions; Dexie-backed code
  is tested against `fake-indexeddb` (`import "fake-indexeddb/auto"`, see `workouts.db.test.ts`)
- `npm run e2e` – Playwright smoke tests in `e2e/` (phone-sized Chromium, starts `next dev -p 3100`). `e2e/helpers.ts`
  fixes the clock to 11 Nov 2026 (Phase 6 week 2, heavy) and loads data through Settings → Restore.
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
- Phases: any programme can be a dated phase (`Programme.phase = { start, weeks, alternate? }`, set in the programme
  editor). All date maths lives in `src/lib/phases.ts` (local YYYY-MM-DD days, DST-safe); `alternate` defaults to on
  (odd weeks volume, even heavy). Train lists running/upcoming phases first and tucks finished ones under "Past phases".
- Phase generator (`/workouts/plan`, `src/app/api/plan/route.ts`, pure helpers in `src/lib/plan.ts`): the page builds a
  compact 12-week training summary (`buildTrainingSummary`) plus the user's brief and POSTs it; the route validates with
  zod (`PlanRequestSchema`), calls Claude Opus 5.5 (`claude-opus-5-5`, effort high, server-side refusal fallback) with
  structured output (`PlanOutputSchema`), then normalises the programme through `parseProgrammeText`. The prompt teaches
  Claude the programme text format and asks it to reuse exact exercise names (weights prefill and progress charts key
  on the name). Saved phases keep `brief` (prefills next time), `summary` and coach `notes`. Requires
  `ANTHROPIC_API_KEY` and `FITLOG_ACCESS_CODE`; the page sends the code as `x-fitlog-code` (remembered in localStorage)
  so strangers can't spend the API credit. Home shows `PhaseReminder` 10 days before a phase ends (`nextPhasePrompt`).
- Equipment (`src/lib/equipment.ts`, `EquipmentCard` in Settings, `settings.equipment`): tap-to-toggle checklist
  (grouped ids, presets, dumbbell/kettlebell max kg, free-text notes) rather than a CSV. When it's filled in, the plan
  page defaults to the "My equipment" chip and sends `equipmentList` (`describeEquipment`) beside the brief; the
  prompt then says to use only that kit. Swaps on a workout drop library alternatives the kit can't do
  (`allowsLibraryEquipment`, coarse map from free-exercise-db's equipment field).
- Coach playbook (experiment, `src/lib/playbook.ts`, `PlaybookCard` in Settings, `settings.coachPlaybook`): a coach's
  philosophy (free text) plus hard rules (max sets per muscle per week, rep range, max exercises per session, banned
  exercises). With it, `planSystem(playbook)` switches the system prompt to "drafting for a coach" and appends the
  playbook; `/api/plan` runs `checkPlaybook` on the draft and, if rules are broken, asks Claude once more to fix them
  (`playbookCheck` in the response). The plan page re-runs `checkPlaybook` live as the programme is edited and can
  untick the playbook to compare with a plain draft. Saved phases keep `draft` (as generated) and `coach`, so coach
  edits can be compared later. Sets per muscle use `plannedMuscleSets` (insights.ts, same counting as `muscleSets`).
- Data safety (`src/lib/backup.ts`): Shell calls `navigator.storage.persist()` on load; exports record `lastBackupAt`
  in `settings`; Home shows `BackupReminder` when there's data and no backup for 14+ days. On touch devices export uses
  the share sheet (save to iCloud/Drive), else a download. Restoring sets `lastBackupAt` to the backup's `exportedAt`.
- Coach review (`src/lib/review.ts`, `src/app/api/review/route.ts`, `CoachReview.tsx` inside the insights card): on
  request only, `buildReviewRequest` sends one finished workout (working/warm-up sets, efforts, per-exercise memos,
  programme notes, session notes, last 3 sessions per exercise, the computed summary) to Claude Opus 5.5 (effort
  medium, structured `ReviewOutputSchema`, refusal fallback). The result is stored on `WorkoutSession.review`. Same
  `ANTHROPIC_API_KEY` + `FITLOG_ACCESS_CODE` gate as the planner (`src/lib/apiAuth.ts` server side,
  `src/lib/accessCode.ts` for the remembered code); hidden when GET reports `configured: false`.
- AI insights (`src/lib/healthInsights.ts`, `src/app/api/insights/route.ts`, `AIInsights.tsx`): an "AI insights ✦" card
  on Body, Vitals, Food and Training → Insights. On request only, `buildInsightsRequest` digests that tab's data
  (per metric: readings, first/latest, 30/90-day averages, range, last 16 weekly averages; food 7/30/90-day macro
  averages + targets; Training reuses `buildTrainingSummary`/`renderTrainingSummary` from plan.ts plus 4-week sets
  per muscle) with the optional `settings.profile` (sex, birth year, height; in "You & your gym") and POSTs it.
  Claude Opus 5.5 (effort medium, `InsightsOutputSchema`: headline, findings with good/watch/flag + action, caveats)
  answers; the result is kept in `settings` `aiInsights.<tab>`. The system prompt treats scale estimates as noisy,
  flags out-of-range vitals for a GP and never suggests changing reps. Same key + access code gate as the planner.
- Exercise how-to: `src/lib/exercises.ts` + `src/data/exercises.json` + `public/exercises/*.jpg` (photos and instructions from the
  public-domain free-exercise-db, hand-mapped to the seeded programme's names; `approx` marks a similar-but-not-identical
  exercise). Tapping the thumbnail on a session card opens `ExerciseModal`. Video: YouTube search link, or a user-pasted
  YouTube/Vimeo link stored in `settings` (`exerciseVideos`). Unknown exercises get no description but keep the video options.
- Training loop (all pure helpers unit-tested):
  - `src/lib/progression.ts`: `parseRepTarget`, `suggestNext` (**weight only, never reps**: top of the rep target on
    every set → +increment, in range → hold, effort nudge, miss streak → deload; none for bodyweight/timed/zero step),
    `defaultIncrement` by equipment; `incrementFor` (exercises.ts) applies per-exercise overrides from
    `settings.exerciseIncrements` (keyed by `exerciseKey`).
  - `workouts.ts`: names match via `exerciseKey` (case/punctuation-insensitive, so imported history joins up);
    `isWorking` = done and not `kind: "warmup"` (warm-ups never count for PRs, volume or suggestions);
    `planExercise` uses the same heavy/volume variant's history first (`variantHistory`, `dayFocus` in phases.ts),
    so heavy follows heavy. It matches the variant, not the day name (ExpertPT reused "Session 1/2/3" across
    phases and exercises move days), and ignores a match more than `VARIANT_MAX_GAP_DAYS` (28) behind the latest
    session of that exercise. The finish summary's "last time this day" uses the same 28-day cut-off;
    `startSession`/`newEntry`/`repeatSession` prefill via `buildEntry`/`prefillSets`: **exactly last time's sets**
    (weight and reps per set position); the suggestion is not auto-applied, `EntryCard` offers it as "Apply".
    `carryDown` (used by the set inputs) copies an edited weight/reps to the later undone working sets that held
    the old value or were blank, so changing set 1 updates the rest while pyramids and lifted sets stay.
  - `schedule.ts`: `weekPlan` (this week's days: matching heavy/volume variant, warm-up days excluded, done by
    `dayName`), `activeProgramme`, `doneSessionFor` (this week's finished session of a day), `estimateMinutes`,
    `dayHref`. Tapping a day (Train, Home's Up next) opens the preview `/workouts/day?p=<programmeId>&d=<dayName>`:
    planned sets as they'll prefill, suggestions, last note, muscles, estimated time, and **Start workout**. A day
    done this week shows Completed + View workout instead of Start; ended phases can't be started; Repeat on the
    session page is for quick (no `dayName`) workouts only. `StartWorkout.tsx`'s `useStartWorkout` is the only way
    to start a programme day: prepends the warm-up day (`settings.includeWarmup`) and refuses a second live session.
  - Set timing: ticking a set in a live workout stores `SetLog.doneAt`. `timing.ts`: `sessionTiming` (active
    minutes, average rest ignoring gaps over 10 min, kg/min) and `staleFinish` (no tick for 2 h, or nothing ticked
    after 3 h): the session page offers "Finish at <last set>", Home/Train cards say "Left open?".
  - Rest timer: end timestamp in localStorage (`restTimer.ts`), rendered in the nav by `RestTimer`; `restAfterSet`
    (rest.ts) waits for the last exercise of a superset. Toasts with Undo: `showToast` (toast.ts) / `ToastBar`.
  - `summary.ts` (post-workout insights: totals vs last time, `personalBests` (e1rm / heaviest / most reps at a
    weight or heavier / volume, never on a first appearance), per-exercise vs last time (variant-aware), muscle sets
    today + training week, timing, rule-based next-time recommendations). Rendered by `WorkoutSummary.tsx` right
    after finishing (`done=1`) and on any finished workout via "View post-workout insights". `plates.ts` (plates per side, warm-up ramp), `insights.ts` (muscle sets per group,
    heatmap/streak, stalled lifts, phase report), `trends.ts` (weight slope, goal ETA, maintenance kcal).
  - Session page is keyed by `id` (Repeat navigates to another id on the same page). Next keeps previous pages
    mounted after navigating, so close any `<dialog>` before calling `router.push`.
  - Other settings keys: `displayName`, `includeWarmup`, `wakeLock`, `barKg`, `plates`.
- Withings: OAuth2 + measure sync run in route handlers (`src/app/api/withings/*`, `src/lib/withings.ts`);
  tokens are httpOnly cookies; client pulls rows and writes them to Dexie, de-duplicating on `ext`
  (`src/lib/withingsSync.ts`). Shell auto-syncs on open / foreground / reconnect and every 5 min while visible,
  once a sync has succeeded on the device (`fitlog.withings.lastSync` in localStorage; cleared on 401 or
  Disconnect). Withings' notify webhooks can't reach IndexedDB, so there's no push; this pull is the substitute.
  Withings rotates the refresh token on every refresh (the old one then fails with token status 503), and the only
  copy is the cookie in that response, so `/api/withings/sync` refreshes in a request of its own (`ensureAccess`,
  answers `{ retry: true }`) before fetching readings, and on a dead token clears the cookies and returns 401: the
  app then toasts and Settings asks to reconnect (`withingsNeedsReconnect`). Settings' Withings card shows the last
  sync, newest reading and last error (`withingsSyncState`), including failures of the automatic sync.
  Besides weight/fat/lean/muscle/BP/HR/SpO₂ it maps the Body Comp/Scan extras (fat mass, bone mass, body water,
  visceral fat, BMR, metabolic age, vascular age, PWV, VO₂ max, temperature; `TYPE_MAP`). Those show as `optional`
  MetricPanel groups on Body/Vitals, hidden until a reading exists. Adding codes: bump `WITHINGS_TYPES_VERSION` so
  each device does one full re-sync (`since=0`, de-duplicated) and old readings of the new types arrive.
  Needs `WITHINGS_CLIENT_ID/SECRET/REDIRECT_URI` in `.env.local` (see `.env.example`).
- CSV import (`parseMeasurementCsv`) accepts a Date column plus Weight / Fat % / Lean mass / Heart rate / etc.
- Offline: `public/sw.js` (production only) is network-first for pages, cache-first for static assets. Pages that take
  their input from the query string (`/workouts/session?id=`, `/workouts/exercise?name=`) are static shells, so offline
  page loads fall back to any cached copy of the same path (`ignoreSearch`). Prefer query params over dynamic segments
  for new data-driven pages so this keeps working.
- ExpertPT history import (Settings → "Import from ExpertPT", `src/components/TrainerizeImport.tsx`,
  `importTrainerize` in `db.ts`, pure mapping in `src/lib/trainerize.ts`): reads a `fitlog-trainerize` v1 bundle
  (workouts with per-set weight/reps/time/distance, exercise notes, body stats) exported once from the owner's own
  Trainerize web account; the bundle lives in git-ignored `/data/trainerize/`. Sessions get `ext: "trainerize:<id>"`
  (indexed, Dexie v4) so re-imports skip them; day names map "(fewer reps / heavier load)" → "· Heavy"; exercise names
  are kept verbatim (they match the Phase 6 seed); a body-stat reading is skipped when that day already has one of
  that type (e.g. from Withings).
- Google Health: Health Connect has no web API. Google's new Google Health API (Fitbit Web API replacement, Nov 2026)
  is web/OAuth but not onboarding new projects yet; Withings already covers scale/BP, so read from Withings for now.

## Landing page (`landing/`)
Separate static Next.js site for the public product idea ("Phasewise", waitlist only), with its own package.json,
lint and tsconfig; the root tsconfig/eslint ignore it. Never import app code into it or deploy the app with it.
Brand strings live in `landing/src/site.ts`. See `landing/README.md`.

## Privacy rules
- Never commit personal data. `/data/` and `.env*` (except `.env.example`) are gitignored.
- Don't hard-code the owner's measurements, goals or photos in source. Goals and targets are user-editable settings.
- Data only leaves the device for Withings sync and, when the user presses Generate, the phase generator (brief +
  workout/weight summary, never photos), and when they press Get coach review (that workout, its notes and recent
  history of its exercises), and when they press Generate AI insights on a tab (that tab's digest + optional profile). Keep it that way and say so in the UI when adding anything that sends data.

## Roadmap
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
5. ~~**Photos.**~~ Done: multi-select import goes to a review grid (per-photo front/side/back + date, "set all"), dated
   from EXIF DateTimeOriginal + OffsetTimeOriginal (`src/lib/exif.ts`, a tiny dependency-free JPEG parser) with the
   file mtime as a flagged fallback. Photos are downscaled to 2000px JPEG before storing (`shrinkPhoto`, keeps the
   original if it can't decode or wouldn't shrink). All/Front/Side/Back tabs, grouped by day; tap one to relabel/redate,
   two to compare (shows the gap between them).
6. ~~**Tests.**~~ Done: Vitest for the programme parser (incl. seed round-trip), measurement + nutrition CSV parsers,
   `series` helpers and workout logic (`computePRs`, `exerciseHistory`, `prSetIndexes`, `previousMemo`). Keep new
   logic in pure functions in `src/lib` so it stays testable without IndexedDB.
7. ~~**Training loop & insights.**~~ Done (Nov 2026 UX pass): progression suggestions + effort tap, heavy/volume-aware
   prefill, "last time" line, persistent superset-aware rest timer, up next + one-live-workout guard + warm-up add-on,
   finish check + summary, plates/warm-up calculator, warm-up sets, swap/reorder/undo, wake lock, edit time, repeat,
   Insights page (muscle volume, heatmap/streak, stalls/deload nudge, phase report), weight trend/ETA, maintenance
   calories, generator gets adherence + stalls, Playwright e2e + fake-indexeddb tests.

8. ~~**Workout flow pass.**~~ Done (Nov 2026): day preview + explicit Start (no restarting a day done this week),
   prefill = last time exactly + carry-down edits, set timestamps + forgotten-workout finish, richer post-workout
   insights reopenable from any finished workout, on-demand Claude coach review that reads the notes.

Ideas not built yet: per-set RPE, supersets/circuits editor UI (beyond the text format), rest timer notifications
when the PWA is backgrounded (needs push), kg/lb units, exercise library beyond the seeded programme.
