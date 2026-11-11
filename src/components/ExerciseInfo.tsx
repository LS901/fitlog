"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { getExerciseVideos, saveExerciseVideo } from "@/lib/db";
import {
  exerciseImageUrl,
  exerciseKey,
  exerciseProgressHref,
  findExercise,
  isWebUrl,
  videoEmbedUrl,
  youtubeSearchUrl,
} from "@/lib/exercises";
import { btnCls, btnGhostCls, inputCls } from "./ui";

/** Small exercise photo that opens the how-to popup. Falls back to a placeholder. */
export function ExerciseThumb({ name, onOpen }: { name: string; onOpen: () => void }) {
  const image = findExercise(name)?.info.images[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`How to do ${name}`}
      className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 active:opacity-70"
    >
      {image ? (
        <Image
          src={exerciseImageUrl(image)}
          alt=""
          width={128}
          height={96}
          unoptimized
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="grid h-full w-full place-items-center text-lg text-zinc-500">ⓘ</span>
      )}
    </button>
  );
}

const pill = "rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-300";

/** Modal with photos, muscles, step-by-step description and an instructional video. */
export function ExerciseModal({ name, onClose }: { name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const found = findExercise(name);
  const key = exerciseKey(name);
  const videos = useLiveQuery(getExerciseVideos, []);
  const mine = videos?.[key];
  const embed = mine ? videoEmbedUrl(mine) : null;
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const saveLink = async () => {
    if (!isWebUrl(link)) {
      setErr("Paste a full link starting with https://");
      return;
    }
    await saveExerciseVideo(key, link.trim());
    setLink("");
    setErr("");
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      aria-label={`How to do ${name}`}
      className="m-auto max-h-[90dvh] w-[min(94vw,36rem)] overflow-y-auto overscroll-contain rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-100 backdrop:bg-black/75"
    >
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{name}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
            className="rounded-lg px-2 py-1 text-zinc-400 active:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        {found && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {found.info.images.map((img, i) => (
                <Image
                  key={img}
                  src={exerciseImageUrl(img)}
                  alt={`${name}: ${i === 0 ? "start" : "end"} position`}
                  width={425}
                  height={284}
                  unoptimized
                  className="aspect-[3/2] w-full rounded-lg bg-zinc-950 object-cover"
                />
              ))}
            </div>

            {found.approx && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Closest match in the exercise library: {found.info.name}. Your PT&apos;s version
                may differ slightly.
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {found.info.equipment && <span className={pill}>{found.info.equipment}</span>}
              {found.info.level && <span className={pill}>{found.info.level}</span>}
              {found.info.muscles.map((m) => (
                <span key={m} className={`${pill} !bg-emerald-500/15 !text-emerald-300`}>
                  {m}
                </span>
              ))}
              {found.info.secondary.map((m) => (
                <span key={m} className={pill}>
                  {m}
                </span>
              ))}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-300">How to do it</h3>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-300">
                {found.info.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </>
        )}

        {!found && (
          <p className="text-sm text-zinc-400">
            No built-in description for this exercise yet. Use the video links below.
          </p>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">Video</h3>
          {mine && embed && (
            <iframe
              src={embed}
              title={`${name} video`}
              loading="lazy"
              allow="encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              className="aspect-video w-full rounded-xl bg-black"
            />
          )}
          {mine && !embed && (
            <a
              href={mine}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btnCls} block text-center`}
            >
              Open your saved video ↗
            </a>
          )}
          <a
            href={youtubeSearchUrl(name)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${mine ? btnGhostCls : btnCls} block text-center`}
          >
            {mine ? "Search YouTube instead ↗" : "Watch how-to videos on YouTube ↗"}
          </a>

          <div className="flex gap-2">
            <input
              type="url"
              inputMode="url"
              className={`${inputCls} py-2 text-sm`}
              placeholder="Paste a YouTube or Vimeo link"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setErr("");
              }}
            />
            <button type="button" className={btnGhostCls} onClick={saveLink}>
              Save
            </button>
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          {mine && (
            <button
              type="button"
              className="text-xs text-zinc-500"
              onClick={() => saveExerciseVideo(key, "")}
            >
              Remove my saved video
            </button>
          )}
          <p className="text-xs text-zinc-500">
            Saved on this device only. YouTube is only contacted when you open a link or view a
            video you saved.
          </p>
        </div>

        <Link
          href={exerciseProgressHref(name)}
          onClick={() => dialog.current?.close()}
          className={`${btnGhostCls} block text-center`}
        >
          Your progress on this exercise →
        </Link>

        {found && (
          <p className="text-[11px] text-zinc-600">
            Photos and instructions: free-exercise-db (public domain).
          </p>
        )}
      </div>
    </dialog>
  );
}
