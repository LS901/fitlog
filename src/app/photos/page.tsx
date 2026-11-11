"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { photoDate } from "@/lib/exif";
import { shrinkPhoto } from "@/lib/images";
import { localDay } from "@/lib/nutrition";
import type { PhotoLabel, ProgressPhoto } from "@/lib/types";
import { Card, Chip, btnCls, btnGhostCls, inputCls } from "@/components/ui";

const LABELS: { value: PhotoLabel; name: string }[] = [
  { value: "front", name: "Front" },
  { value: "side", name: "Side" },
  { value: "back", name: "Back" },
];

type Tab = PhotoLabel | "all";

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

/** A picked file waiting for the user to check its label and date before saving. */
interface Staged {
  key: string;
  blob: Blob;
  url: string;
  date: string;
  fromExif: boolean;
  label: PhotoLabel;
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Moves an ISO timestamp to another local calendar day, keeping its time of day. */
function withDay(iso: string, day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(iso);
  t.setFullYear(y, m - 1, d);
  return t.toISOString();
}

export default function PhotosPage() {
  const photos = useLiveQuery(() => db.photos.orderBy("date").reverse().toArray(), []);
  const urls = useUrls(photos);
  const [tab, setTab] = useState<Tab>("all");
  const [picked, setPicked] = useState<number[]>([]);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // free the staging previews if the page is left mid-review
  const stagedRef = useRef(staged);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);
  useEffect(() => () => stagedRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  const onFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/") || !f.type);
    if (fileRef.current) fileRef.current.value = "";
    if (!list.length) return;
    setReading({ done: 0, total: list.length });
    const out: Staged[] = [];
    for (const [i, f] of list.entries()) {
      // date first: shrinking re-encodes the image and drops its EXIF
      const { date, fromExif } = await photoDate(f);
      const blob = await shrinkPhoto(f);
      out.push({
        key: `${Date.now()}-${i}-${f.name}`,
        blob,
        url: URL.createObjectURL(blob),
        date,
        fromExif,
        label: tab === "all" ? "front" : tab,
      });
      setReading({ done: i + 1, total: list.length });
    }
    setReading(null);
    setStaged((s) => [...s, ...out].sort((a, b) => a.date.localeCompare(b.date)));
  };

  const updateStaged = (key: string, patch: Partial<Staged>) =>
    setStaged((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const dropStaged = (keys: string[]) =>
    setStaged((s) => {
      for (const x of s) if (keys.includes(x.key)) URL.revokeObjectURL(x.url);
      return s.filter((x) => !keys.includes(x.key));
    });

  const saveStaged = async () => {
    await db.photos.bulkAdd(staged.map(({ blob, date, label }) => ({ blob, date, label })));
    dropStaged(staged.map((s) => s.key));
  };

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));

  const shown = (photos ?? []).filter((p) => tab === "all" || p.label === tab);
  const count = (t: Tab) => (photos ?? []).filter((p) => t === "all" || p.label === t).length;

  const selected = picked
    .map((id) => photos?.find((p) => p.id === id))
    .filter((p): p is ProgressPhoto => !!p)
    .sort((a, b) => a.date.localeCompare(b.date));

  // newest day first, photos within a day in front/side/back order
  const byDay = new Map<string, ProgressPhoto[]>();
  for (const p of shown) {
    const k = localDay(new Date(p.date));
    byDay.set(k, [...(byDay.get(k) ?? []), p]);
  }
  const order = (l: PhotoLabel) => LABELS.findIndex((x) => x.value === l);

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">Photos</h1>

      <div className="flex flex-wrap gap-2">
        {([{ value: "all", name: "All" }, ...LABELS] as { value: Tab; name: string }[]).map((t) => (
          <Chip key={t.value} active={tab === t.value} onClick={() => setTab(t.value)}>
            {t.name} <span className="text-zinc-500">{count(t.value)}</span>
          </Chip>
        ))}
      </div>

      <Card title="Add photos">
        <button
          className={`${btnCls} w-full`}
          disabled={!!reading}
          onClick={() => fileRef.current?.click()}
        >
          {reading ? `Reading ${reading.done} of ${reading.total}…` : "Choose from camera roll"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        <p className="mt-2 text-xs text-zinc-500">
          Pick as many as you like. Each is dated from when it was taken (or the file date if the
          photo doesn&apos;t say) and you can check the dates and front/side/back before saving.
          Stored on this device only; large photos are resized to save space.
        </p>
      </Card>

      {staged.length > 0 && (
        <StagingCard
          staged={staged}
          onChange={updateStaged}
          onSetAll={(label) => setStaged((s) => s.map((x) => ({ ...x, label })))}
          onRemove={(key) => dropStaged([key])}
          onCancel={() => dropStaged(staged.map((s) => s.key))}
          onSave={saveStaged}
        />
      )}

      {selected.length === 2 && (
        <Card
          title="Compare"
          action={
            <button className="text-xs text-zinc-400" onClick={() => setPicked([])}>
              Clear
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            {selected.map((p) => (
              <figure key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urls[p.id!]}
                  alt={`${p.label} ${longDate(p.date)}`}
                  className="aspect-[3/4] w-full rounded-xl object-cover"
                />
                <figcaption className="mt-1 text-center text-xs text-zinc-500">
                  {longDate(p.date)} · {p.label}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-zinc-400">
            {daysBetween(selected[0].date, selected[1].date)} apart
          </p>
        </Card>
      )}

      {selected.length === 1 && (
        <EditCard key={selected[0].id} photo={selected[0]} onDone={() => setPicked([])} />
      )}

      {shown.length > 0 ? (
        <p className="text-xs text-zinc-500">
          Tap a photo to edit it, or two to compare them.
        </p>
      ) : (
        photos &&
        !staged.length && (
          <p className="py-6 text-center text-sm text-zinc-500">
            {photos.length ? "No photos with this label yet." : "No progress photos yet."}
          </p>
        )
      )}

      {[...byDay.entries()].map(([day, ps]) => (
        <section key={day}>
          <h2 className="mb-2 text-xs font-medium text-zinc-400">{longDate(`${day}T12:00:00`)}</h2>
          <div className="grid grid-cols-3 gap-2">
            {[...ps]
              .sort((a, b) => order(a.label) - order(b.label))
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id!)}
                  aria-pressed={picked.includes(p.id!)}
                  className={`relative overflow-hidden rounded-xl ${
                    picked.includes(p.id!) ? "ring-2 ring-emerald-400" : ""
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={urls[p.id!]}
                    alt={`${p.label} ${longDate(p.date)}`}
                    className="aspect-[3/4] w-full object-cover"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] capitalize">
                    {p.label}
                  </span>
                </button>
              ))}
          </div>
        </section>
      ))}

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

function daysBetween(a: string, b: string) {
  const days = Math.round(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 864e5);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30.44)} months`;
}

/** Front / side / back toggle. */
function LabelPicker({
  value,
  onChange,
  small,
}: {
  /** undefined when nothing is selected (e.g. "set all" over mixed labels) */
  value: PhotoLabel | undefined;
  onChange: (l: PhotoLabel) => void;
  small?: boolean;
}) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Photo label">
      {LABELS.map((l) => (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={value === l.value}
          onClick={() => onChange(l.value)}
          className={`flex-1 rounded-lg border ${small ? "py-1 text-[11px]" : "py-1.5 text-xs"} ${
            value === l.value
              ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
              : "border-zinc-700 text-zinc-400"
          }`}
        >
          {small ? l.name[0] : l.name}
        </button>
      ))}
    </div>
  );
}

function StagingCard({
  staged,
  onChange,
  onSetAll,
  onRemove,
  onCancel,
  onSave,
}: {
  staged: Staged[];
  onChange: (key: string, patch: Partial<Staged>) => void;
  onSetAll: (label: PhotoLabel) => void;
  onRemove: (key: string) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const undated = staged.filter((s) => !s.fromExif).length;
  return (
    <Card title={`Review ${staged.length} photo${staged.length === 1 ? "" : "s"}`}>
      <div className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
        <span className="shrink-0">Set all:</span>
        <div className="flex-1">
          <LabelPicker
            value={staged.every((s) => s.label === staged[0].label) ? staged[0].label : undefined}
            onChange={onSetAll}
          />
        </div>
      </div>
      {undated > 0 && (
        <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {undated === 1
            ? `${staged.length === 1 ? "This" : "1"} photo doesn't say when it was taken`
            : `${undated === staged.length ? "These" : undated} photos don't say when they were taken`}
          , so the file date is used. Check the dates marked ⚠.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {staged.map((s) => (
          <li key={s.key} className="space-y-1.5">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt="" className="aspect-[3/4] w-full rounded-lg object-cover" />
              <button
                type="button"
                aria-label="Don't import this photo"
                onClick={() => onRemove(s.key)}
                className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-xs"
              >
                ✕
              </button>
            </div>
            <LabelPicker small value={s.label} onChange={(label) => onChange(s.key, { label })} />
            <label className="flex items-center gap-1">
              {!s.fromExif && (
                <span className="text-xs text-amber-300" title="Date from the file, not the photo">
                  ⚠
                </span>
              )}
              <input
                type="date"
                aria-label="Date taken"
                className={`${inputCls} px-2 py-1 text-xs`}
                value={localDay(new Date(s.date))}
                // a date the user picked counts as checked, so the ⚠ goes away
                onChange={(e) =>
                  e.target.value &&
                  onChange(s.key, { date: withDay(s.date, e.target.value), fromExif: true })
                }
              />
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <button
          className={`${btnCls} flex-1`}
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave();
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : `Save ${staged.length}`}
        </button>
        <button className={btnGhostCls} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </Card>
  );
}

/** Change a saved photo's label or date. */
function EditCard({ photo, onDone }: { photo: ProgressPhoto; onDone: () => void }) {
  const update = (patch: Partial<ProgressPhoto>) => db.photos.update(photo.id!, patch);
  return (
    <Card
      title="Edit photo"
      action={
        <button className="text-xs text-zinc-400" onClick={onDone}>
          Done
        </button>
      }
    >
      <div className="space-y-3">
        <LabelPicker value={photo.label} onChange={(label) => update({ label })} />
        <input
          type="date"
          aria-label="Date taken"
          className={inputCls}
          value={localDay(new Date(photo.date))}
          onChange={(e) => e.target.value && update({ date: withDay(photo.date, e.target.value) })}
        />
        <p className="text-xs text-zinc-500">Tap another photo to compare it with this one.</p>
      </div>
    </Card>
  );
}
