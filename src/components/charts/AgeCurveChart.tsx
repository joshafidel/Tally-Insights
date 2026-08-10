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

export function AgeCurveChart({
  points,
}: {
  points: { age: number; avg: number | null; n: number }[];
}) {
  return (
    <ResponsiveContainer role="img" aria-label="Mean sentiment by exact age" width="100%" height={220}>
      <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="age"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickCount={8}
        />
        <YAxis
          domain={[1, 5]}
          ticks={[1, 2, 3, 4, 5]}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          width={24}
        />
        <ReferenceLine y={3} stroke="var(--brand-200)" strokeDasharray="4 4" />
        <Tooltip
          formatter={(value, _name, item) => [
            `mean ${Number(value).toFixed(2)} (n=${item?.payload?.n})`,
            `Age ${item?.payload?.age}`,
          ]}
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
          dot={{ r: 2, fill: "var(--brand-600)" }}
          activeDot={{ r: 4 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
