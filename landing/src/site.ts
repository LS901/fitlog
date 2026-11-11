// Everything brand-specific lives here, so renaming is a one-file change.
export const site = {
  name: "Phasewise",
  tagline: "Your next training block, written from your own logs.",
  description:
    "A gym log that plans ahead. Log your sessions, and when a phase ends Phasewise writes the next one from what you actually lifted.",
  /** Form endpoint that accepts a JSON POST (Formspree works as-is). Empty = form shows "not connected". */
  waitlistEndpoint: process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT ?? "",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
};
