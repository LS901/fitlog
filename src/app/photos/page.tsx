"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { PhotoLabel, ProgressPhoto } from "@/lib/types";
import { Card, btnCls, btnGhostCls, inputCls } from "@/components/ui";

// One object URL per photo, created lazily and reused (freed when the page unloads).
const urlCache = new Map<number, string>();
function useUrls(photos: ProgressPhoto[] | undefined) {
  const urls: Record<number, string> = {};
  for (const p of photos ?? []) {
    let u = urlCache.get(p.id!);
    if (!u) {
      u = URL.createObjectURL(p.blob);
      urlCache.set(p.id!, u);
    }
    urls[p.id!] = u;
  }
  return urls;
}

export default function PhotosPage() {
  const photos = useLiveQuery(
    () => db.photos.orderBy("date").reverse().toArray(),
    [],
  );
  const urls = useUrls(photos);
  const [label, setLabel] = useState<PhotoLabel>("front");
  const [picked, setPicked] = useState<number[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      await db.photos.add({
        blob: f,
        label,
        date: new Date(f.lastModified || Date.now()).toISOString(),
      });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggle = (id: number) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2),
    );

  const compare = picked
    .map((id) => photos?.find((p) => p.id === id))
    .filter(Boolean) as ProgressPhoto[];
  compare.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">Photos</h1>

      <Card title="Add photos">
        <div className="flex gap-2">
          <select
            className={inputCls}
            value={label}
            onChange={(e) => setLabel(e.target.value as PhotoLabel)}
          >
            <option value="front">Front</option>
            <option value="side">Side</option>
            <option value="back">Back</option>
          </select>
          <button className={btnCls} onClick={() => fileRef.current?.click()}>
            Choose
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Stored on this device only. Dated from the file&apos;s modified time.
        </p>
      </Card>

      {compare.length === 2 && (
        <Card
          title="Compare"
          action={
            <button className="text-xs text-zinc-400" onClick={() => setPicked([])}>
              Clear
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            {compare.map((p) => (
              <figure key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urls[p.id!]}
                  alt={`${p.label} ${p.date}`}
                  className="aspect-[3/4] w-full rounded-xl object-cover"
                />
                <figcaption className="mt-1 text-center text-xs text-zinc-500">
                  {new Date(p.date).toLocaleDateString("en-GB")}
                </figcaption>
              </figure>
            ))}
          </div>
        </Card>
      )}

      {photos && photos.length > 0 && (
        <p className="text-xs text-zinc-500">Tap two photos to compare them.</p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {photos?.map((p) => (
          <button
            key={p.id}
            onClick={() => toggle(p.id!)}
            className={`relative overflow-hidden rounded-xl ${
              picked.includes(p.id!) ? "ring-2 ring-emerald-400" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urls[p.id!]}
              alt={`${p.label} ${p.date}`}
              className="aspect-[3/4] w-full object-cover"
            />
            <span className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5 text-center text-[10px]">
              {new Date(p.date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}{" "}
              · {p.label}
            </span>
          </button>
        ))}
      </div>

      {picked.length > 0 && (
        <button
          className={`${btnGhostCls} w-full text-red-400`}
          onClick={async () => {
            if (confirm(`Delete ${picked.length} photo(s)?`)) {
              await db.photos.bulkDelete(picked);
              setPicked([]);
            }
          }}
        >
          Delete selected
        </button>
      )}
    </div>
  );
}
