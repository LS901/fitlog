import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/site";

export const metadata: Metadata = { title: `Privacy · ${site.name}` };

export default function Privacy() {
  const contact = site.contactEmail ? (
    <a href={`mailto:${site.contactEmail}`} className="text-emerald-300 underline">
      {site.contactEmail}
    </a>
  ) : (
    "the contact address on this site"
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← {site.name}
      </Link>
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">Waitlist privacy notice</h1>
      <div className="mt-8 space-y-6 text-zinc-300 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-100">
        <section>
          <h2>What we collect</h2>
          <p className="mt-2">
            When you join the waitlist: your email address, whether you train yourself or coach clients, your answers
            to the two optional questions, and which site or link sent you here.
          </p>
        </section>
        <section>
          <h2>Why</h2>
          <p className="mt-2">
            To email you when {site.name} opens up, and to decide what to build and what to charge. We rely on your
            consent, which you give by submitting the form and can withdraw at any time.
          </p>
        </section>
        <section>
          <h2>Who handles it</h2>
          <p className="mt-2">
            Sign-ups are stored by our form provider (Formspree) on our behalf. We don&apos;t sell or share your details
            with anyone else, and this page sets no tracking cookies.
          </p>
        </section>
        <section>
          <h2>How long we keep it</h2>
          <p className="mt-2">
            Until launch plus 12 months, or until you ask us to remove it, whichever comes first.
          </p>
        </section>
        <section>
          <h2>Your rights</h2>
          <p className="mt-2">
            You can ask to see, correct or delete your details by emailing {contact}. If you&apos;re unhappy with how
            we&apos;ve handled your data, you can complain to the Information Commissioner&apos;s Office (ico.org.uk).
          </p>
        </section>
      </div>
    </main>
  );
}
