"use client";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { STATUS_LABELS } from "@/lib/metrics";

const COLORS = {
  PASSED: "#10b981", FAILED: "#ef4444", BLOCKED: "#f59e0b",
  SKIPPED: "#64748b", RETEST: "#8b5cf6", NOT_RUN: "#94a3b8",
};

export function StatusChart({ data }) {
  const rows = data.map((d) => ({ ...d, name: STATUS_LABELS[d.status] }));
  return (
    <div className="h-64" role="img" aria-label="Execution results by status">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip cursor={{ opacity: 0.1 }} />
          <Bar dataKey="value" name="Cases" radius={[4, 4, 0, 0]}>
            {rows.map((r) => <Cell key={r.status} fill={COLORS[r.status]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ data }) {
  return (
    <div className="h-64" role="img" aria-label="Pass rate trend">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis dataKey="day" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v) => `${v}%`} />
          <Line type="monotone" dataKey="passRate" name="Pass rate" stroke="#10b981" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
