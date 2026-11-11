# Fitlog

Personal workout, body-stats and vitals tracker. Local-first PWA: Next.js + TypeScript + Tailwind,
data in IndexedDB (Dexie). Nothing leaves your device except Withings API calls.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
# production / installable PWA:
npm run build && npm start
```

On your phone, open the deployed URL and use "Add to Home Screen". (Service worker only runs in production builds.)

## What's in it

- **Train** – programmes (text editor: `# Day`, `Name 4x6 rest 90s (note)`, `+` to superset), live session logging
  with per-exercise rest timer, previous weights prefilled, history, estimated-1RM bests, PR badges, per-exercise
  notes and a progress page per exercise (1RM / top set / volume charts).
  Seeded with ExpertPT Phase 6 (2 Nov – 27 Dec 2026); odd weeks = volume, even weeks = heavy.
- **Body** – weight, body fat, muscle mass, tape measurements, trend charts.
- **Vitals** – resting HR, blood pressure, SpO₂, sleep, steps.
- **Photos** – bulk import from the camera roll (dated from EXIF), front/side/back tabs, side-by-side compare
  (stored on-device, resized to save space).
- **Settings** – Withings sync, CSV import, JSON backup/restore.

## Withings sync

1. Create an app at https://developer.withings.com/ (free for personal use).
2. Register the callback URL, e.g. `http://localhost:3000/api/withings/callback` or your deployed `https://…/api/withings/callback`.
3. Copy `.env.example` to `.env.local` and fill in the client id/secret.
4. Settings → Connect Withings → Sync now.

Tokens are kept in httpOnly cookies; no server database.

## Backups

Data lives in this browser's storage. Use Settings → Export backup regularly.
