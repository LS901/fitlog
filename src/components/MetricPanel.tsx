"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { MEASURES, dayKey, fmt, shortDate, toLocalInputValue } from "@/lib/measures";
import type { MeasureType } from "@/lib/types";
import { Card, Stat, TrendChart, btnCls, inputCls } from "./ui";

interface Group {
  title: string;
  types: MeasureType[];
}

/** Chart + latest values + quick-add form for a set of measurement types. */
export function MetricPanel({
  groups,
  addable,
}: {
  groups: Group[];
  addable: MeasureType[];
}) {
  const all = groups.flatMap((g) => g.types);
  const rows = useLiveQuery(
    () => db.measurements.where("type").anyOf(all).sortBy("date"),
    [all.join()],
  );

  const latest = useMemo(() => {
    const m = new Map<MeasureType, { value: number; prev?: number }>();
    for (const r of rows ?? []) {
      const cur = m.get(r.type);
      m.set(r.type, { value: r.value, prev: cur?.value });
    }
    return m;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {all
          .filter((t) => latest.has(t))
          .slice(0, 4)
          .map((t) => {
            const l = latest.get(t)!;
            const d = l.prev !== undefined ? l.value - l.prev : undefined;
            return (
              <Stat
                key={t}
                label={MEASURES[t].label}
                value={fmt(t, l.value)}
                sub={
                  d === undefined
                    ? undefined
                    : `${d > 0 ? "+" : ""}${d.toFixed(MEASURES[t].decimals)} since last`
                }
              />
            );
          })}
      </div>

      {groups.map((g) => (
        <Card key={g.title} title={g.title}>
          <TrendChart
            data={buildSeries(rows ?? [], g.types)}
            series={g.types.map((t) => ({ key: t, label: MEASURES[t].label }))}
          />
        </Card>
      ))}

      <AddForm types={addable} />
      <Recent rows={rows ?? []} />
    </div>
  );
}

function buildSeries(
  rows: { date: string; type: MeasureType; value: number }[],
  types: MeasureType[],
) {
  const byDay = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    if (!types.includes(r.type)) continue;
    const k = dayKey(r.date);
    const o = byDay.get(k) ?? { label: shortDate(r.date), day: k };
    o[r.type] = r.value;
    byDay.set(k, o);
  }
  return [...byDay.values()].sort((a, b) =>
    String(a.day).localeCompare(String(b.day)),
  );
}

function AddForm({ types }: { types: MeasureType[] }) {
  const [type, setType] = useState<MeasureType>(types[0]);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(toLocalInputValue());

  const submit = async () => {
    const v = parseFloat(value);
    if (isNaN(v)) return;
    await db.measurements.add({
      type,
      value: v,
      date: new Date(date).toISOString(),
      source: "manual",
    });
    setValue("");
    setDate(toLocalInputValue());
  };

  return (
    <Card title="Add entry">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select
            className={inputCls}
            value={type}
            onChange={(e) => setType(e.target.value as MeasureType)}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {MEASURES[t].label}
              </option>
            ))}
          </select>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              className={inputCls}
              placeholder="Value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
              {MEASURES[type].unit}
            </span>
          </div>
        </div>
        <input
          type="datetime-local"
          className={inputCls}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button className={`${btnCls} w-full`} onClick={submit}>
          Save
        </button>
      </div>
    </Card>
  );
}

function Recent({
  rows,
}: {
  rows: { id?: number; date: string; type: MeasureType; value: number; source: string }[];
}) {
  const recent = [...rows].reverse().slice(0, 15);
  if (!recent.length) return null;
  return (
    <Card title="Recent entries">
      <ul className="divide-y divide-zinc-800">
        {recent.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2 text-sm">
            <div>
              <span>{MEASURES[r.type].label}</span>{" "}
              <span className="text-xs text-zinc-500">
                {shortDate(r.date)} · {r.source}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums">{fmt(r.type, r.value)}</span>
              <button
                aria-label="Delete entry"
                className="text-zinc-600"
                onClick={() => db.measurements.delete(r.id!)}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
