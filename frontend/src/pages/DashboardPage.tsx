import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { AlertTriangle, ArrowRight, FileText, MessageSquareText, Smile, Star, Upload, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { CategoryChart, KpiCard, PlatformChart, SentimentDonut } from "@/components/charts/Charts";
import { RequireBusiness } from "@/components/layout/guards";
import { EmptyState, PageHeader, PageWrapper } from "@/components/layout/common";
import { CategoryBadge, UrgencyBadge } from "@/components/reviews/ReviewBits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { formatDate, formatWeek } from "@/lib/utils";
import { reviewService, statsService } from "@/services/reviewLensService";
import type { Business, WeekInfo } from "@/types";

export function WeekPicker({
  weeks,
  value,
  onChange,
}: {
  weeks: WeekInfo[];
  value: string;
  onChange: (week: string) => void;
}) {
  return (
    <Select aria-label="Week" className="h-9 w-64" value={value} onChange={(e) => onChange(e.target.value)}>
      {weeks.map((w) => (
        <option key={w.week_start} value={w.week_start}>
          {formatWeek(w.week_start, w.week_end)} · {w.review_count} reviews
        </option>
      ))}
    </Select>
  );
}

function DashboardView({ business }: { business: Business }) {
  const navigate = useNavigate();
  const [week, setWeek] = useState<string>("");
  const weeksQuery = useQuery({ queryKey: ["weeks", business.id], queryFn: () => statsService.weeks(business.id) });
  const weeks = weeksQuery.data ?? [];
  const selectedWeek = week || weeks[0]?.week_start || "";

  const statsQuery = useQuery({
    queryKey: ["stats", business.id, selectedWeek],
    queryFn: () => statsService.stats(business.id, selectedWeek || undefined),
    enabled: Boolean(selectedWeek),
    retry: (count, err) => !(isAxiosError(err) && err.response?.status === 404) && count < 2,
  });
  const cur = statsQuery.data?.current;
  const deltas = statsQuery.data?.deltas;

  const urgentQuery = useQuery({
    queryKey: ["reviews", business.id, "urgent", selectedWeek],
    queryFn: () =>
      reviewService.list(business.id, {
        urgency: "high",
        date_from: cur?.week_start,
        date_to: cur?.week_end,
        page: 1,
        page_size: 6,
        sort: "-review_date",
      }),
    enabled: Boolean(cur),
  });

  if (weeksQuery.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (!weeks.length) {
    return (
      <EmptyState
        icon={Upload}
        title="No reviews yet"
        description={`Upload a CSV of reviews for ${business.name} to see your dashboard.`}
        action={
          <Button asChild variant="gradient">
            <Link to="/upload">Upload reviews</Link>
          </Button>
        }
      />
    );
  }

  const weekLink = cur ? `date_from=${cur.week_start}&date_to=${cur.week_end}` : "";

  return (
    <PageWrapper>
      <PageHeader
        title="Dashboard"
        description={`How customers felt about ${business.name}`}
        actions={
          <>
            <WeekPicker weeks={weeks} value={selectedWeek} onChange={setWeek} />
            <Button asChild variant="outline">
              <Link to="/reports">
                <FileText /> Weekly report
              </Link>
            </Button>
          </>
        }
      />

      {!cur ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          {cur.urgent_count > 0 && (
            <Card className="flex flex-col gap-3 border-red-500/30 bg-red-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-600 p-2 text-white">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">
                    URGENT: {cur.urgent_count} review{cur.urgent_count > 1 ? "s" : ""} need a reply within 24 hours
                  </p>
                  <p className="text-sm text-muted-foreground">Health, refund, abuse or wrong-order complaints.</p>
                </div>
              </div>
              <Button asChild variant="destructive">
                <Link to={`/reviews?urgency=high&${weekLink}`}>
                  Reply now <ArrowRight />
                </Link>
              </Button>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total reviews"
              value={String(cur.total)}
              delta={deltas?.total}
              goodDirection="up"
              icon={<Users className="h-4 w-4" />}
            />
            <KpiCard
              label="Positive"
              value={`${cur.sentiment.positive.pct}%`}
              delta={deltas?.positive_pct}
              deltaSuffix=" pts"
              goodDirection="up"
              icon={<Smile className="h-4 w-4" />}
            />
            <KpiCard
              label="Urgent reviews"
              value={String(cur.urgent_count)}
              delta={deltas?.urgent_count}
              goodDirection="down"
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <KpiCard
              label="Average rating"
              value={cur.avg_rating !== null ? `${cur.avg_rating} ★` : "—"}
              delta={deltas?.avg_rating}
              goodDirection="up"
              icon={<Star className="h-4 w-4" />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <SentimentDonut stats={cur} />
            </div>
            <div className="lg:col-span-3">
              <CategoryChart
                stats={cur}
                onSelect={(c) => navigate(`/reviews?category=${c}&${weekLink}`)}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <PlatformChart stats={cur} />
            </div>
            <Card className="lg:col-span-3">
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>High-urgency reviews</CardTitle>
                  <CardDescription>Reply to these first</CardDescription>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link to={`/reviews?urgency=high&${weekLink}`}>
                    View all <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {urgentQuery.data?.items.length ? (
                  <ul className="divide-y">
                    {urgentQuery.data.items.map((r) => (
                      <li key={r.id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.summary ?? r.review_text}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.review_id} · {r.platform} · {formatDate(r.review_date)}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <CategoryBadge value={r.category} />
                          <UrgencyBadge value={r.urgency} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">No urgent reviews this week 🎉</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="flex flex-col items-start gap-3 bg-gradient-to-r from-primary/10 to-fuchsia-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Have a question about these reviews?</p>
              <p className="text-sm text-muted-foreground">Ask AI, e.g. “Why are Swiggy customers unhappy this week?”</p>
            </div>
            <Button asChild variant="gradient">
              <Link to="/ask">
                <MessageSquareText /> Ask your reviews
              </Link>
            </Button>
          </Card>
        </>
      )}
    </PageWrapper>
  );
}

export function DashboardPage() {
  return <RequireBusiness>{(business) => <DashboardView business={business} />}</RequireBusiness>;
}
