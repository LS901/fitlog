"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getGoals } from "./db";
import type { Goals } from "./types";

const NONE: Goals = {};

/** Live goals/targets from Dexie. Empty object until the user sets something. */
export function useGoals(): Goals {
  return useLiveQuery(getGoals, []) ?? NONE;
}
