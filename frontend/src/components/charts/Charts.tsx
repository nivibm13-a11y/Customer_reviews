import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/hooks/useAuth";
import { CATEGORY_LABELS, CHART_INK, SENTIMENT_COLORS, SENTIMENT_LABELS, SERIES_COLOR } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { CATEGORIES, type Category, type Sentiment, SENTIMENTS, type WeekStats } from "@/types";

/* ------------------------------------------------------------------ KPI tile */

export interface KpiProps {
  label: string;
  value: string;
  delta?: number | null;
  /** "up" if an increase is good (e.g. % positive), "down" if a decrease is good (e.g. urgent). */
  goodDirection: "up" | "down";
  deltaSuffix?: string;
  icon: ReactNode;
  hint?: string;
}

export function KpiCard({ label, value, delta, goodDirection, deltaSuffix = "", icon, hint }: KpiProps) {
  const hasDelta = delta !== undefined && delta !== null;
  const flat = hasDelta && Math.abs(delta) < 0.05;
  const good = hasDelta && !flat && (goodDirection === "up" ? delta > 0 : delta < 0);
  const Arrow = !hasDelta || flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const deltaText = hasDelta ? `${delta > 0 ? "+" : ""}${Number(delta.toFixed(2))}${deltaSuffix}` : "";
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-sm font-medium">{label}</span>
        <span className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        {hasDelta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
              flat
                ? "bg-muted text-muted-foreground"
                : good
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-500/15 text-red-700 dark:text-red-400",
            )}
            aria-label={`${flat ? "No change" : good ? "Improved" : "Worse"} vs last week: ${deltaText}`}
          >
            <Arrow className="h-3.5 w-3.5" />
            {deltaText}
          </span>
        ) : null}
        <span className="text-muted-foreground">{hasDelta ? "vs last week" : (hint ?? "no previous week")}</span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ shared */

function useChartTheme() {
  const { theme } = useTheme();
  return { sentiment: SENTIMENT_COLORS[theme], series: SERIES_COLOR[theme], ink: CHART_INK[theme] };
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey ?? p.name)} className="flex items-center gap-2 text-muted-foreground">
          <svg width="8" height="8" aria-hidden="true">
            <rect width="8" height="8" rx="2" fill={p.color ?? p.payload?.fill} />
          </svg>
          {p.name}: <span className="font-semibold tabular-nums text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function SentimentLegend({ colors }: { colors: Record<Sentiment, string> }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {SENTIMENTS.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden="true">
            <rect width="10" height="10" rx="3" fill={colors[s]} />
          </svg>
          {SENTIMENT_LABELS[s]}
        </span>
      ))}
    </div>
  );
}

function TableToggle({ table, onToggle }: { table: boolean; onToggle: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onToggle} className="h-7 text-xs">
      {table ? "Chart" : "Table"}
    </Button>
  );
}

/* ------------------------------------------------------------------ sentiment donut */

export function SentimentDonut({ stats }: { stats: WeekStats }) {
  const { sentiment: colors, ink } = useChartTheme();
  const data = SENTIMENTS.map((s) => ({
    key: s,
    name: SENTIMENT_LABELS[s],
    value: stats.sentiment[s].count,
    pct: stats.sentiment[s].pct,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sentiment split</CardTitle>
        <CardDescription>{stats.analysed} analysed reviews</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid items-center gap-4 sm:grid-cols-2">
          <div className="relative h-52" role="img" aria-label="Sentiment split donut chart">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="92%"
                  paddingAngle={2}
                  cornerRadius={4}
                  stroke={ink.surface}
                  strokeWidth={2}
                  isAnimationActive
                >
                  {data.map((d) => (
                    <Cell key={d.key} fill={colors[d.key]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tabular-nums">{stats.sentiment.positive.pct}%</span>
              <span className="text-xs text-muted-foreground">positive</span>
            </div>
          </div>
          {/* Direct labels + table: identity never relies on colour alone. */}
          <ul className="space-y-3">
            {data.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2">
                  <svg width="10" height="10" aria-hidden="true">
                    <rect width="10" height="10" rx="3" fill={colors[d.key]} />
                  </svg>
                  {d.name}
                </span>
                <span className="tabular-nums">
                  <span className="font-semibold">{d.pct}%</span>
                  <span className="ml-2 text-muted-foreground">({d.value})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ category stacked bars */

export function CategoryChart({ stats, onSelect }: { stats: WeekStats; onSelect?: (c: Category) => void }) {
  const { sentiment: colors, ink } = useChartTheme();
  const [table, setTable] = useState(false);
  const negative = stats.negative_by_category;
  const positive = stats.positive_by_category;
  const data = CATEGORIES.map((c) => ({
    key: c,
    name: CATEGORY_LABELS[c],
    positive: positive[c],
    negative: negative[c],
    neutral: Math.max(stats.category[c] - positive[c] - negative[c], 0),
    total: stats.category[c],
  })).sort((a, b) => b.total - a.total);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>What customers talk about</CardTitle>
          <CardDescription>Reviews per category, split by sentiment · click a bar to filter</CardDescription>
        </div>
        <TableToggle table={table} onToggle={() => setTable(!table)} />
      </CardHeader>
      <CardContent className="space-y-3">
        {table ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1">Category</th>
                <th className="py-1 text-right">Positive</th>
                <th className="py-1 text-right">Neutral</th>
                <th className="py-1 text-right">Negative</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.map((d) => (
                <tr key={d.key} className="border-t">
                  <td className="py-1.5">{d.name}</td>
                  <td className="py-1.5 text-right">{d.positive}</td>
                  <td className="py-1.5 text-right">{d.neutral}</td>
                  <td className="py-1.5 text-right">{d.negative}</td>
                  <td className="py-1.5 text-right font-semibold">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            <SentimentLegend colors={colors} />
            <div className="h-72" role="img" aria-label="Reviews per category stacked by sentiment">
              <ResponsiveContainer>
                <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }} barCategoryGap={10}>
                  <CartesianGrid horizontal={false} stroke={ink.grid} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: ink.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fill: ink.axis, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: ink.grid, opacity: 0.5 }} />
                  {SENTIMENTS.map((s, i) => (
                    <Bar
                      key={s}
                      dataKey={s}
                      name={SENTIMENT_LABELS[s]}
                      stackId="sentiment"
                      fill={colors[s]}
                      stroke={ink.surface}
                      strokeWidth={2}
                      radius={i === SENTIMENTS.length - 1 ? [0, 4, 4, 0] : 0}
                      cursor={onSelect ? "pointer" : undefined}
                      onClick={(entry: { key?: Category }) => entry.key && onSelect?.(entry.key)}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ platform bars (single series) */

export function PlatformChart({ stats }: { stats: WeekStats }) {
  const { series, ink } = useChartTheme();
  const data = Object.entries(stats.platform)
    .map(([name, total]) => ({ name, total, negative: stats.negative_by_platform[name] ?? 0 }))
    .sort((a, b) => b.total - a.total);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reviews by platform</CardTitle>
        <CardDescription>Volume this week · negatives in the table below</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-44" role="img" aria-label="Reviews by platform bar chart">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 16 }}>
              <CartesianGrid vertical={false} stroke={ink.grid} />
              <XAxis dataKey="name" tick={{ fill: ink.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} width={32} tick={{ fill: ink.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: ink.grid, opacity: 0.5 }} />
              <Bar dataKey="total" name="Reviews" fill={series} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="w-full text-xs">
          <tbody className="tabular-nums">
            {data.map((d) => (
              <tr key={d.name} className="border-t">
                <td className="py-1 text-muted-foreground">{d.name}</td>
                <td className="py-1 text-right">{d.total} reviews</td>
                <td className="py-1 text-right text-muted-foreground">{d.negative} negative</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
