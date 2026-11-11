import Link from "next/link";
import { WaitlistForm } from "@/components/WaitlistForm";
import { site } from "@/site";

const steps = [
  {
    n: "1",
    title: "Log fast",
    body: "Sets come prefilled from last time on the same day, so most of a session is tap, tap, done. A rest timer that keeps going when your phone locks. Plates per side and warm-up ramps worked out for you.",
  },
  {
    n: "2",
    title: "Progress on purpose",
    body: "Hit the top of your rep range and it suggests the next weight. Miss, and it holds. Stall three times, and it tells you it's time to deload. Heavy weeks follow heavy weeks, volume follows volume.",
  },
  {
    n: "3",
    title: "Get your next phase",
    body: "When a block ends, answer six questions: goal, focus, days, time, equipment, injuries. Phasewise reads your last 12 weeks and writes a dated next phase with notes on why. You review and edit it before it's saved.",
  },
];

const features = [
  ["Progression suggestions", "Double progression with an optional easy / good / hard tap per exercise."],
  ["Stall and deload nudges", "Spots lifts that haven't moved and says so before you've wasted a month."],
  ["Insights", "Sets per muscle per week, a training heatmap and streak, and a report at the end of each phase."],
  ["Body and weight trend", "Weight trend, goal ETA, measurements and an estimate of your maintenance calories."],
  ["Progress photos", "Front, side and back, dated from the photo itself, compared side by side. Kept on your device."],
  ["Works offline", "Basements and garages with no signal are where a lot of lifting happens."],
];

const faqs = [
  [
    "When does it launch?",
    "It's in daily use by its first lifter now and opens to the waitlist in small batches. Join to get an invite.",
  ],
  [
    "What will it cost?",
    "Logging, progression and insights will be free. Planning your next phase will be a paid add-on. The waitlist form asks what you'd pay, and the answers set the price.",
  ],
  [
    "iPhone or Android?",
    "Both, as a web app you add to your home screen. Native apps will follow if the waitlist wants them.",
  ],
  [
    "Where does my data go?",
    "Your log is stored on your device. When you ask for a new phase, a training summary (lifts, sets, weights, body weight trend and your answers) is sent to plan it. Photos never leave your phone.",
  ],
  [
    "I already have a coach. Is this for me?",
    "Phasewise is for people who program for themselves. If you're a coach, pick “I coach clients” on the form: we're looking at a version where you review the drafted phase before your client sees it.",
  ],
];

function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[3rem] bg-emerald-400/10 blur-2xl" />
      <div className="relative space-y-3 rounded-[2rem] border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-300">Next phase drafted</p>
          <p className="mt-1 font-display text-lg font-semibold">Phase 7 · Strength · 6 weeks</p>
          <p className="mt-1 text-sm text-zinc-400">Starts Mon 28 Dec · 4 days a week · 60 min</p>
          <ul className="mt-3 space-y-1.5 text-sm text-zinc-300">
            <li>• Bench stalled at 80 kg for three sessions: rebuild at 4×5 from 75 kg.</li>
            <li>• Squat moved every week: keep the progression, add a heavy single.</li>
            <li>• You trained 3.4 days a week, not 4: Friday becomes optional.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-medium">Back squat</p>
            <p className="text-xs text-zinc-500">4×6–8 · rest 2:30</p>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Last time 97.5 kg × 8, 8, 8, 7</p>
          <p className="mt-2 inline-block rounded-md bg-emerald-400/15 px-2 py-1 text-xs font-medium text-emerald-300">
            Try 100 kg today ↑
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
            {["100 × 8", "100 × 8", "100 × 7", "—"].map((s, i) => (
              <span
                key={i}
                className={`rounded-lg py-2 ${i < 3 ? "bg-zinc-800 text-zinc-100" : "border border-dashed border-zinc-700 text-zinc-600"}`}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <p className="text-sm text-zinc-400">Rest</p>
          <p className="font-display text-2xl font-semibold tabular-nums">1:47</p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight">
          {site.name}
        </Link>
        <a href="#join" className="rounded-lg px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-400/10">
          Join the waitlist
        </a>
      </header>

      <main>
        {/* overflow-x-clip: the phone mock's glow would otherwise widen the page on phones */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 overflow-x-clip px-4 pt-8 pb-20 sm:px-6 md:grid-cols-2 md:pt-16">
          <div>
            <p className="text-sm font-medium text-emerald-300">For lifters who program for themselves</p>
            <h1 className="mt-3 font-display text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl">
              {site.tagline}
            </h1>
            <p className="mt-5 max-w-lg text-lg text-zinc-400">
              {site.name} is a gym log that plans ahead. Log your sessions, and when a phase ends it writes the next one
              from what you actually lifted: what moved, what stalled and how often you showed up.
            </p>
            <div className="mt-8 max-w-md" id="join">
              <WaitlistForm />
            </div>
          </div>
          <PhoneMock />
        </section>

        <section className="border-t border-zinc-900 bg-zinc-950/60">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="font-display text-3xl font-bold tracking-tight">How it works</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {steps.map((s) => (
                <li key={s.n} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                  <span className="flex size-8 items-center justify-center rounded-full bg-emerald-400 font-semibold text-zinc-950">
                    {s.n}
                  </span>
                  <h3 className="mt-4 font-display text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-zinc-400">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight">Everything else you&apos;d want in a log</h2>
          <dl className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(([title, body]) => (
              <div key={title}>
                <dt className="font-semibold text-zinc-100">{title}</dt>
                <dd className="mt-1 text-zinc-400">{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t border-zinc-900 bg-zinc-950/60">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
            <h2 className="font-display text-3xl font-bold tracking-tight">Questions</h2>
            <div className="mt-8 divide-y divide-zinc-800 border-y border-zinc-800">
              {faqs.map(([q, a]) => (
                <details key={q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {q}
                    <span className="text-zinc-500 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-zinc-400">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight">Want in early?</h2>
          <p className="mt-3 text-zinc-400">Invites go out in small batches, waitlist first.</p>
          <div className="mt-8 text-left">
            <WaitlistForm />
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-zinc-500 sm:px-6">
          <p>© {new Date().getFullYear()} {site.name}</p>
          <nav className="flex gap-5">
            <Link href="/privacy" className="hover:text-zinc-300">
              Privacy
            </Link>
            {site.contactEmail && (
              <a href={`mailto:${site.contactEmail}`} className="hover:text-zinc-300">
                Contact
              </a>
            )}
          </nav>
        </div>
      </footer>
    </>
  );
}
