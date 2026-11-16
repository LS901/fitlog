/** The access code for Claude features (phase generator, coach review), remembered per device. */
const CODE_KEY = "fitlog.planCode";

export function readAccessCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveAccessCode(code: string) {
  try {
    localStorage.setItem(CODE_KEY, code.trim());
  } catch {
    /* not fatal: they'll be asked again */
  }
}
