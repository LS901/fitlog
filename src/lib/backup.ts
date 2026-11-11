import { db, exportAll } from "./db";

/** Remind the user to export once a backup is this old (or they've never made one). */
export const BACKUP_REMINDER_DAYS = 14;

const LAST_BACKUP_KEY = "lastBackupAt";

export interface BackupStatus {
  /** whole days since the last backup; undefined if there has never been one */
  daysSince?: number;
  /** true when there is data worth protecting and the backup is missing or stale */
  due: boolean;
}

export function backupStatus(
  lastBackupAt: string | undefined,
  hasData: boolean,
  now = new Date(),
): BackupStatus {
  const daysSince =
    lastBackupAt === undefined
      ? undefined
      : Math.max(0, Math.floor((now.getTime() - new Date(lastBackupAt).getTime()) / 864e5));
  return {
    daysSince,
    due: hasData && (daysSince === undefined || daysSince >= BACKUP_REMINDER_DAYS),
  };
}

export async function getLastBackup(): Promise<string | undefined> {
  return (await db.settings.get(LAST_BACKUP_KEY))?.value as string | undefined;
}

export async function setLastBackup(iso: string) {
  await db.settings.put({ key: LAST_BACKUP_KEY, value: iso });
}

/** Whether there is anything the user would be upset to lose. */
export async function hasUserData() {
  const counts = await Promise.all([db.sessions.count(), db.measurements.count(), db.photos.count()]);
  return counts.some((n) => n > 0);
}

/**
 * Exports everything as a JSON file. On phones this opens the share sheet (so it can go straight to
 * iCloud Drive / Google Drive / Files); elsewhere it downloads. Returns false if the user cancelled
 * the share sheet, in which case the backup date isn't updated.
 */
export async function saveBackup(): Promise<boolean> {
  const data = await exportAll();
  const name = `fitlog-backup-${data.exportedAt.slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data)], name, { type: "application/json" });

  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Fitlog backup" });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return false;
      download(file);
    }
  } else {
    download(file);
  }
  await setLastBackup(data.exportedAt);
  return true;
}

function download(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Ask the browser not to evict our storage under pressure. Silent where the browser decides itself. */
export async function requestPersistentStorage(): Promise<boolean | undefined> {
  try {
    if (!navigator.storage?.persist) return undefined;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return undefined;
  }
}
