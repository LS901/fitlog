"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";

/**
 * Live value of a `settings` key. Returns `undefined` while loading (so callers can avoid flashing
 * the fallback), then the stored value or `fallback`.
 */
export function useSetting<T>(key: string, fallback: T): T | undefined {
  return useLiveQuery(
    async () => {
      const row = await db.settings.get(key);
      return { value: row === undefined ? fallback : (row.value as T) };
    },
    [key],
  )?.value;
}
