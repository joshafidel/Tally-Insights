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

export type TrendChartPoint = {
  day: string;
  avg: number | null;
  n: number;
};

export function TrendChart({ points }: { points: TrendChartPoint[] }) {
  const data = points.map((p) => ({
    ...p,
    label: new Date(p.day + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <ResponsiveContainer role="img" aria-label="Sentiment trend over time" width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tick={{ fill: "var(--muted)", fontSize: 12 }}
          minTickGap={48}
        />
        <YAxis
          domain={[1, 5]}
          ticks={[1, 2, 3, 4, 5]}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted)", fontSize: 12 }}
          width={28}
        />
        <ReferenceLine y={3} stroke="var(--brand-200)" strokeDasharray="4 4" />
        <Tooltip
          formatter={(value, _name, item) => [
            `mean ${Number(value).toFixed(2)} (n=${item?.payload?.n.toLocaleString("en-US")})`,
            "Cumulative sentiment",
          ]}
          labelStyle={{ fontSize: 12 }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            fontSize: 12,
          }}
        />
        <Line
          isAnimationActive={false}
          type="monotone"
          dataKey="avg"
          stroke="var(--brand-600)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "var(--brand-600)" }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
