import raw from "@/data/exercises.json";

/**
 * Exercise reference data: photos, muscles and step-by-step instructions from the public-domain
 * free-exercise-db (https://github.com/yuhonas/free-exercise-db, Unlicense). Only the exercises used
 * in the seeded programme are bundled (see src/data/exercises.json and public/exercises/).
 */
export interface ExerciseInfo {
  /** dataset id */
  id: string;
  /** name in the exercise library (may differ from the programme's name) */
  name: string;
  muscles: string[];
  secondary: string[];
  equipment?: string | null;
  level?: string | null;
  instructions: string[];
  /** paths under /exercises/ */
  images: string[];
}

const data = raw as unknown as {
  exercises: Record<string, Omit<ExerciseInfo, "id">>;
  aliases: Record<string, { id: string; approx?: boolean }>;
};

/** Case/punctuation-insensitive key used for matching exercise names. */
export const exerciseKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Looks an exercise up by the name used in the programme/session. `approx` means the library only
 * has a similar exercise (e.g. a different grip or equipment), so the UI can say so.
 */
export function findExercise(name: string): { info: ExerciseInfo; approx: boolean } | null {
  const key = exerciseKey(name);
  const alias = data.aliases[key];
  if (alias) return { info: { id: alias.id, ...data.exercises[alias.id] }, approx: !!alias.approx };
  for (const [id, ex] of Object.entries(data.exercises)) {
    if (exerciseKey(ex.name) === key) return { info: { id, ...ex }, approx: false };
  }
  return null;
}

/** Names offered as suggestions when adding an exercise to a workout. */
export const EXERCISE_NAMES = Object.values(data.exercises)
  .map((e) => e.name)
  .sort((a, b) => a.localeCompare(b));

export const exerciseImageUrl = (path: string) => `/exercises/${encodeURI(path)}`;

export const youtubeSearchUrl = (name: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise how to`)}`;

/**
 * Turns a user-pasted YouTube or Vimeo link into an embeddable player URL, or null when the link
 * isn't one of those (the UI then offers a plain "open link" instead of embedding arbitrary sites).
 */
export function videoEmbedUrl(link: string): string | null {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www|m)\./, "");

  let yt: string | null = null;
  if (host === "youtu.be") yt = u.pathname.split("/")[1] || null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") yt = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/);
      yt = m ? m[1] : null;
    }
  }
  if (yt && /^[\w-]{6,20}$/.test(yt)) return `https://www.youtube-nocookie.com/embed/${yt}`;

  if (host === "vimeo.com") {
    const m = u.pathname.match(/^\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }
  return null;
}

/** True for http(s) URLs: the only kind we'll store or link to. */
export function isWebUrl(link: string): boolean {
  try {
    const u = new URL(link.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
