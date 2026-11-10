"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
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

export function TrendChart({
  data,
  series,
  height = 180,
}: {
  data: Record<string, number | string>[];
  series: { key: string; label: string }[];
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        Add at least two entries to see a trend.
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
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
