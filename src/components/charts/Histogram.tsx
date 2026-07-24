"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SENTIMENT_RAMP } from "@/lib/format";

const BUCKET_LABEL = [
  "1 Strongly disagree",
  "2",
  "3 Neutral",
  "4",
  "5 Strongly agree",
];

export function Histogram({ distribution }: { distribution: number[] }) {
  const total = distribution.reduce((a, b) => a + b, 0);
  const data = distribution.map((count, i) => ({
    bucket: BUCKET_LABEL[i],
    short: String(i + 1),
    count,
    pct: total > 0 ? Math.round((count / total) * 100) : 0,
    pctLabel: total > 0 ? `${Math.round((count / total) * 100)}%` : "",
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 22, right: 8, left: 8, bottom: 0 }}>
        <XAxis
          dataKey="short"
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tick={{ fill: "var(--muted)", fontSize: 12 }}
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: "var(--brand-50)" }}
          formatter={(value, _name, item) => [
            `${Number(value).toLocaleString("en-US")} responses (${item?.payload?.pct}%)`,
            item?.payload?.bucket,
          ]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            fontSize: 12,
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={SENTIMENT_RAMP[i]} />
          ))}
          <LabelList
            dataKey="pctLabel"
            position="top"
            style={{ fill: "var(--foreground)", fontSize: 12 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
