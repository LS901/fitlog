"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 ${className}`}
    >
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && (
            <h2 className="text-sm font-medium text-zinc-300">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export const inputCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-base outline-none focus:border-emerald-500";

export const btnCls =
  "rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-zinc-950 active:bg-emerald-400 disabled:opacity-50";

export const btnGhostCls =
  "rounded-xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-200 active:bg-zinc-800 disabled:opacity-50";

export const COLORS = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24"];

/** Small toggle pill, used for range selectors and on/off switches. */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
          : "border-zinc-700 text-zinc-400 active:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

export function TrendChart({
  data,
  series,
  height = 180,
  referenceLine,
}: {
  data: Record<string, number | string>[];
  /**
   * `color` picks a palette slot (defaults to the series index). `overlay` draws a thin dashed
   * step line, used for weekly averages on top of the daily readings.
   */
  series: { key: string; label: string; color?: number; overlay?: boolean }[];
  height?: number;
  /** horizontal line, e.g. a goal weight; the y-axis stretches to include it */
  referenceLine?: { y: number; label: string };
}) {
  if (data.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        Not enough entries in this range to show a trend.
      </p>
    );
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="label" stroke="#71717a" fontSize={11} tickLine={false} />
          <YAxis
            stroke="#71717a"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          {referenceLine && (
            <ReferenceLine
              y={referenceLine.y}
              ifOverflow="extendDomain"
              stroke="#fbbf24"
              strokeDasharray="4 4"
              label={{
                value: referenceLine.label,
                position: "insideTopRight",
                fill: "#fbbf24",
                fontSize: 11,
              }}
            />
          )}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type={s.overlay ? "stepAfter" : "monotone"}
              dataKey={s.key}
              name={s.label}
              stroke={COLORS[(s.color ?? i) % COLORS.length]}
              strokeWidth={s.overlay ? 1.5 : 2}
              strokeDasharray={s.overlay ? "5 4" : undefined}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
