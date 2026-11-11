"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { stopRest } from "@/lib/restTimer";
import { isWarmupDay, warmupDay } from "@/lib/schedule";
import { useSetting } from "@/lib/useSetting";
import { startSession } from "@/lib/workouts";
import type { Programme, ProgrammeDay } from "@/lib/types";
import { btnCls, btnGhostCls } from "./ui";

type Pending = { programme?: Programme; day?: ProgrammeDay };

/**
 * Starts workouts. Prepends the programme's warm-up day when the user wants it, and if a workout
 * is already in progress asks whether to resume, finish or discard it instead of quietly opening
 * a second one. Render `dialog` somewhere on the page.
 */
export function useStartWorkout() {
  const router = useRouter();
  const active = useLiveQuery(() => db.sessions.filter((s) => !s.finishedAt).first(), []);
  const includeWarmup = useSetting("includeWarmup", true);
  const [pending, setPending] = useState<Pending | null>(null);

  const launch = async ({ programme, day }: Pending) => {
    const warm =
      programme && day && includeWarmup && !isWarmupDay(day) ? warmupDay(programme) : undefined;
    const id = await startSession(programme?.name, day, warm);
    router.push(`/workouts/session?id=${id}`);
  };

  const start = (programme?: Programme, day?: ProgrammeDay) => {
    if (active) setPending({ programme, day });
    else void launch({ programme, day });
  };

  const dialog =
    pending && active ? (
      <InProgressDialog
        activeName={active.dayName ?? "Quick workout"}
        nextName={pending.day?.name ?? "an empty workout"}
        onResume={() => router.push(`/workouts/session?id=${active.id}`)}
        onFinish={async () => {
          await db.sessions.update(active.id!, { finishedAt: new Date().toISOString() });
          stopRest();
          await launch(pending);
        }}
        onDiscard={async () => {
          await db.sessions.delete(active.id!);
          stopRest();
          await launch(pending);
        }}
        onClose={() => setPending(null)}
      />
    ) : null;

  return { start, dialog, active };
}

function InProgressDialog({
  activeName,
  nextName,
  onResume,
  onFinish,
  onDiscard,
  onClose,
}: {
  activeName: string;
  nextName: string;
  onResume: () => void;
  onFinish: () => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  // Close before acting: Next keeps the previous page mounted (hidden) after navigating, and a
  // modal left open there would make the next page inert.
  const then = (action: () => void) => () => {
    ref.current?.close();
    action();
  };
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      aria-label="Workout in progress"
      className="m-auto w-[min(92vw,24rem)] rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-100 backdrop:bg-black/75"
    >
      <h2 className="font-medium">{activeName} is still in progress</h2>
      <p className="mt-1 text-sm text-zinc-400">Only one workout can be live at a time.</p>
      <div className="mt-4 space-y-2">
        <button className={`${btnCls} w-full`} onClick={then(onResume)}>
          Resume {activeName}
        </button>
        <button className={`${btnGhostCls} w-full`} onClick={then(onFinish)}>
          Finish it, then start {nextName}
        </button>
        <button
          className={`${btnGhostCls} w-full !text-red-400`}
          onClick={() => confirm(`Discard ${activeName} and its sets?`) && then(onDiscard)()}
        >
          Discard it, then start {nextName}
        </button>
        <button className="w-full py-2 text-sm text-zinc-400" onClick={() => ref.current?.close()}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
