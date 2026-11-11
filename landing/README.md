# Phasewise landing page

Waitlist page for testing demand before building the public app. Static Next.js site (`output: "export"`), separate
from the Fitlog app in the repo root so the personal app is never deployed with it.

- Brand name, tagline and description: `src/site.ts` (one place to rename).
- Waitlist form: `src/components/WaitlistForm.tsx`. Records email, lifter/coach, two optional questions (how they
  plan now, what they'd pay or whether AI drafts would save a coach time) and the source (`?ref=` or `utm_source`).

## Run

```bash
cd landing
npm install
npm run dev        # http://localhost:3200
npm run build      # static site in out/
npx tsc --noEmit && npx eslint .
```

## Before going live

1. Create a free form at https://formspree.io and set `NEXT_PUBLIC_WAITLIST_ENDPOINT` to its URL
   (e.g. `https://formspree.io/f/abcdwxyz`). Without it the form says it isn't connected.
2. Set `NEXT_PUBLIC_CONTACT_EMAIL` to an address you read (shown on the privacy page and footer).
3. Deploy: on Vercel, import the repo and set **Root Directory** to `landing` (framework: Next.js). Add the two
   variables above in the project settings. Any static host works too: upload `out/`.
4. Turn on the host's privacy-friendly analytics (e.g. Vercel Web Analytics) so you can measure
   visitors → sign-ups, not just sign-ups.

## Reading the results

Share the page with a `ref` per place, e.g. `https://…/?ref=r-weightroom`, `?ref=instagram`, so each sign-up shows
where it came from. Things to watch: sign-up rate per source, the lifter/coach split, and the "what would you pay"
answers (anything under ~10% picking £4+ says the planner alone won't carry a subscription).
