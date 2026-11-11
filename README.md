# Fitlog

Personal workout, body-stats and vitals tracker. Local-first PWA: Next.js + TypeScript + Tailwind,
data in IndexedDB (Dexie). Nothing leaves your device except Withings sync and, when you ask for one,
a training summary sent to Claude to write your next phase.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
# production / installable PWA:
npm run build && npm start
npm test             # unit tests (Vitest)
npm run e2e          # browser smoke tests (Playwright; first time: npx playwright install chromium)
```

On your phone, open the deployed URL and use "Add to Home Screen". (Service worker only runs in production builds.)

## What's in it

- **Train** – programmes (text editor: `# Day`, `Name 4x6 rest 90s (note)`, `+` to superset) and live session
  logging. Highlights:
  - "Up next" picks this week's next session (the right heavy/volume variant), with the warm-up added on.
  - Sets are prefilled from the same day last time, with a **progression suggestion** (double progression: hit the
    top of the rep range → add the equipment's weight step; missed reps → hold; stuck three times → deload).
    An optional Easy / Good / Hard tap per exercise sharpens it.
  - A rest timer that survives locking the phone (beep and buzz, ±15s, superset-aware), screen kept awake.
  - Plates per side and warm-up ramps for barbell lifts, warm-up sets, swapping a busy machine for a same-muscle
    alternative, reordering, undo.
  - Finish summary: time, sets and volume vs last time, PRs, and lifts ready to go up.
  - History, estimated-1RM bests, PR badges, per-exercise notes and a progress page per exercise (charts,
    next-time suggestion, weight step, strength relative to body weight).
  - **Insights**: training heatmap and streak, sets per muscle group per week, stalled lifts and deload nudge, phase
    report.
  - Seeded with ExpertPT Phase 6 (2 Nov – 27 Dec 2026); odd weeks = volume, even weeks = heavy. ExpertPT history can
    be imported in Settings.
- **Body** – weight, body fat, muscle mass, tape measurements, trend charts; goal ETA from the weight trend.
- **Food** – daily calories/macros vs targets (manual or MyFitnessPal CSV), estimated maintenance calories.
- **Vitals** – resting HR, blood pressure, SpO₂, sleep, steps.
- **Photos** – bulk import from the camera roll (dated from EXIF), front/side/back tabs, side-by-side compare
  (stored on-device, resized to save space).
- **Plan next phase** – answer a few questions (goal, focus, days, time, equipment, injuries) and Claude writes
  the next dated phase from your training history; review/edit, then save. Home reminds you 10 days before a
  phase ends.
- **Settings** – Withings sync, CSV import, JSON backup/restore (with reminders and persistent storage).

## Withings sync

1. Create an app at https://developer.withings.com/ (free for personal use).
2. Register the callback URL, e.g. `http://localhost:3000/api/withings/callback` or your deployed `https://…/api/withings/callback`.
3. Copy `.env.example` to `.env.local` and fill in the client id/secret.
4. Settings → Connect Withings → Sync now.

Tokens are kept in httpOnly cookies; no server database.

## Phase generator

Set `ANTHROPIC_API_KEY` (from console.anthropic.com) and `FITLOG_ACCESS_CODE` (any passphrase) in `.env.local`
locally and in the Vercel project settings. The app asks for the access code once per device.

## Backups

Data lives in this browser's storage. Use Settings → Export backup regularly.
