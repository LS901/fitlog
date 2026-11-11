"use client";

import { dismissToast, useToast } from "@/lib/toast";

/** Renders the current toast above the bottom nav. */
export function ToastBar() {
  const toast = useToast();
  if (!toast) return null;
  return (
    <div className="mx-auto max-w-xl px-5 pt-2" role="status">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-800 px-4 py-2.5 text-sm shadow-lg">
        <span className="min-w-0 truncate">{toast.message}</span>
        {toast.undo && (
          <button
            className="shrink-0 font-medium text-emerald-400"
            onClick={() => {
              toast.undo!();
              dismissToast();
            }}
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
