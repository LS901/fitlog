"use client";

import { useSyncExternalStore } from "react";

/** One-at-a-time toast with an optional Undo, e.g. after removing a set. */
export interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(message: string, undo?: () => void, ms = 5000) {
  clearTimeout(timer);
  current = { id: nextId++, message, undo };
  emit();
  timer = setTimeout(dismissToast, ms);
}

export function dismissToast() {
  clearTimeout(timer);
  current = null;
  emit();
}

export function useToast() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
