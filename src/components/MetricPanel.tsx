"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { MEASURES, dayKey, fmt, shortDate, toLocalInputValue } from "@/lib/measures";
import { RANGES, rangeStart, weekStart, weeklyAverages, type Range } from "@/lib/series";
import type { MeasureType } from "@/lib/types";
import { Card, Chip, Stat, TrendChart, btnCls, inputCls } from "./ui";

interface Group {
  title: string;
  types: MeasureType[];
  /** draw a dashed goal line at this value (in the unit of the first type) */
  goalLine?: number;
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
  const [range, setRange] = useState<Range>("3M");
  const [weekly, setWeekly] = useState(true);
  const start = rangeStart(range);
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

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Chip key={r} active={r === range} onClick={() => setRange(r)}>
            {r}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-zinc-800" aria-hidden />
        <Chip active={weekly} onClick={() => setWeekly((w) => !w)}>
          Weekly avg
        </Chip>
      </div>

      {groups.map((g) => {
        // Charts with many lines are already busy, so the overlay is limited to 1–2 series.
        const overlay = weekly && g.types.length <= 2;
        return (
          <Card key={g.title} title={g.title}>
            <TrendChart
              data={buildSeries(rows ?? [], g.types, overlay, start)}
              series={[
                ...g.types.map((t) => ({ key: t, label: MEASURES[t].label })),
                ...(overlay
                  ? g.types.map((t, i) => ({
                      key: `${t}_wk`,
                      label: `${MEASURES[t].label} (wk avg)`,
                      color: i,
                      overlay: true,
                    }))
                  : []),
              ]}
              referenceLine={
                g.goalLine === undefined
                  ? undefined
                  : { y: g.goalLine, label: `Goal ${fmt(g.types[0], g.goalLine)}` }
              }
            />
            <WeeklyList rows={rows ?? []} types={g.types} start={start} />
          </Card>
        );
      })}

      <AddForm types={addable} />
      <Recent rows={rows ?? []} />
    </div>
  );
}

type Row = { date: string; type: MeasureType; value: number };

/**
 * One point per day. With `withWeekly`, each point also carries `<type>_wk`: the average of that
 * calendar week's readings (computed over all data, then cut to `start`, so a week that straddles
 * the range start still uses its full set of readings).
 */
function buildSeries(
  rows: Row[],
  types: MeasureType[],
  withWeekly: boolean,
  start?: string,
) {
  const byDay = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    if (!types.includes(r.type)) continue;
    const k = dayKey(r.date);
    const o = byDay.get(k) ?? { label: shortDate(r.date), day: k };
    o[r.type] = r.value;
    byDay.set(k, o);
  }
  const points = [...byDay.values()].sort((a, b) =>
    String(a.day).localeCompare(String(b.day)),
  );

  if (withWeekly) {
    for (const t of types) {
      const avg = new Map(
        weeklyAverages(
          points.flatMap((p) =>
            typeof p[t] === "number" ? [{ day: String(p.day), value: p[t] as number }] : [],
          ),
        ).map((w) => [w.week, w.avg]),
      );
      for (const p of points) {
        const a = avg.get(weekStart(String(p.day)));
        if (a !== undefined) p[`${t}_wk`] = a;
      }
    }
  }

  return start ? points.filter((p) => String(p.day) >= start) : points;
}

/** Collapsible list of calendar-week averages (newest first) under a chart. */
function WeeklyList({
  rows,
  types,
  start,
}: {
  rows: Row[];
  types: MeasureType[];
  start?: string;
}) {
  const perType = types.map((t) => ({
    t,
    weeks: weeklyAverages(
      rows.filter((r) => r.type === t).map((r) => ({ day: dayKey(r.date), value: r.value })),
    ),
  }));
  const first = start ? weekStart(start) : undefined;
  const weeks = [...new Set(perType.flatMap((p) => p.weeks.map((w) => w.week)))]
    .filter((w) => !first || w >= first)
    .sort()
    .reverse()
    .slice(0, 12);
  if (!weeks.length) return null;

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-zinc-400">Weekly averages</summary>
      <ul className="mt-2 divide-y divide-zinc-800 text-sm">
        {weeks.map((w) => (
          <li key={w} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5">
            <span className="text-xs text-zinc-500">w/c {shortDate(`${w}T12:00:00`)}</span>
            <span className="flex flex-wrap gap-x-3 tabular-nums">
              {perType.map(({ t, weeks: ws }) => {
                const a = ws.find((x) => x.week === w);
                return a ? (
                  <span key={t}>
                    {types.length > 1 && (
                      <span className="text-xs text-zinc-500">{MEASURES[t].label} </span>
                    )}
                    {fmt(t, a.avg)}
                  </span>
                ) : null;
              })}
            </span>
          </li>
        ))}
      </ul>
    </details>
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
