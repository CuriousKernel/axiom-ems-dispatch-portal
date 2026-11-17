import { ClientOnly } from "@tanstack/react-router";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { JunctionReading } from "@/lib/axiom/types";
import { mockTrend } from "@/lib/axiom/seed";

export function ClearTimeChart({ reading }: { reading: JunctionReading }) {
  const data = mockTrend(reading);
  return (
    <div className="h-36 w-full">
      <ClientOnly fallback={<div className="h-full w-full rounded-md bg-muted" />}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="t" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `${v}s`} stroke="var(--border)" />
            <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--popover-foreground)",
              }}
            />
            <Line type="monotone" dataKey="eta" name="Ambulance ETA (s)" stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="clearTime" name="Clear time (s)" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ClientOnly>
    </div>
  );
}
