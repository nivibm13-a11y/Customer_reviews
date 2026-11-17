import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, FileText, Heart, ListChecks, Printer, RefreshCw, Sparkles, ThumbsDown } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { RequireBusiness } from "@/components/layout/guards";
import { AnimatedList, EmptyState, PageHeader, PageWrapper } from "@/components/layout/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { CATEGORY_LABELS } from "@/lib/labels";
import { errorMessage, formatDate, formatWeek } from "@/lib/utils";
import { reportService, statsService } from "@/services/reviewLensService";
import type { Business } from "@/types";
import { WeekPicker } from "@/pages/DashboardPage";

function GenerateDialog({ business, open, onOpenChange }: { business: Business; open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: weeks = [] } = useQuery({
    queryKey: ["weeks", business.id],
    queryFn: () => statsService.weeks(business.id),
    enabled: open,
  });
  const [week, setWeek] = useState("");
  const selected = week || weeks[0]?.week_start || "";
  const generate = useMutation({
    mutationFn: (w: string) => reportService.generate(business.id, w),
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: ["reports", business.id] });
      queryClient.setQueryData(["report", report.id], report);
      onOpenChange(false);
      navigate(`/reports/${report.id}`);
    },
    onError: (e) => toast.error(errorMessage(e, "Could not generate the report")),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate weekly report"
      description="AI writes the narrative; all counts come straight from your data."
    >
      {weeks.length ? (
        <div className="space-y-4">
          <WeekPicker weeks={weeks} value={selected} onChange={setWeek} />
          <Button variant="gradient" className="w-full" loading={generate.isPending} onClick={() => generate.mutate(selected)}>
            <Sparkles /> {generate.isPending ? "Writing report..." : "Generate"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Upload reviews first.</p>
      )}
    </Dialog>
  );
}

function ReportsView({ business }: { business: Business }) {
  const [open, setOpen] = useState(false);
  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports", business.id],
    queryFn: () => reportService.list(business.id),
  });
  if (isLoading) return <Spinner />;
  return (
    <PageWrapper>
      <PageHeader
        title="Weekly reports"
        description="A 5-minute read that turns feedback into decisions."
        actions={
          <Button variant="gradient" onClick={() => setOpen(true)}>
            <Sparkles /> Generate report
          </Button>
        }
      />
      {!reports?.length ? (
        <EmptyState
          icon={FileText}
          title="No reports yet"
          description="Generate your first weekly insights report from analysed reviews."
          action={
            <Button variant="gradient" onClick={() => setOpen(true)}>
              <Sparkles /> Generate report
            </Button>
          }
        />
      ) : (
        <AnimatedList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => (
            <Link key={r.id} to={`/reports/${r.id}`}>
              <Card className="p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <FileText className="h-5 w-5 text-primary" />
                <p className="mt-3 font-semibold">{formatWeek(r.week_start, r.week_end)}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  {r.urgent_count > 0 && <Badge variant="high">{r.urgent_count} urgent</Badge>}
                  Generated {formatDate(r.generated_at)}
                </div>
              </Card>
            </Link>
          ))}
        </AnimatedList>
      )}
      <GenerateDialog business={business} open={open} onOpenChange={setOpen} />
    </PageWrapper>
  );
}

export function ReportsPage() {
  return <RequireBusiness>{(business) => <ReportsView business={business} />}</RequireBusiness>;
}

export function ReportPage() {
  const { id } = useParams();
  const reportId = Number(id);
  const queryClient = useQueryClient();
  const { data: report, isLoading, isError } = useQuery({
    queryKey: ["report", reportId],
    queryFn: () => reportService.get(reportId),
    enabled: Number.isFinite(reportId),
  });
  const regenerate = useMutation({
    mutationFn: () => reportService.generate(report!.business_id, report!.week_start),
    onSuccess: (r) => {
      queryClient.setQueryData(["report", r.id], r);
      toast.success("Report regenerated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <Spinner label="Loading report..." />;
  if (isError || !report) {
    return <EmptyState icon={FileText} title="Report not found" description="It may have been deleted." />;
  }
  const s = report.stats;
  const weekLink = `date_from=${report.week_start}&date_to=${report.week_end}`;

  return (
    <PageWrapper className="mx-auto max-w-3xl">
      <div className="no-print flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/reports">
            <ArrowLeft /> All reports
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => regenerate.mutate()} loading={regenerate.isPending}>
            <RefreshCw /> Regenerate
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> Print / PDF
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary to-fuchsia-500 p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/80">Weekly feedback report</p>
          <h1 className="mt-1 text-2xl font-bold">{formatWeek(report.week_start, report.week_end)}</h1>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Total reviews", String(s.total)],
              ["Positive", `${s.sentiment.positive.pct}%`],
              ["Neutral", `${s.sentiment.neutral.pct}%`],
              ["Negative", `${s.sentiment.negative.pct}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur">
                <p className="text-xs text-white/80">{label}</p>
                <p className="text-xl font-bold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <CardContent className="space-y-8 p-6">
          {report.urgent_count > 0 && (
            <Link
              to={`/reviews?urgency=high&${weekLink}`}
              className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4 hover:bg-red-500/10"
            >
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span className="font-semibold">
                URGENT: {report.urgent_count} review{report.urgent_count > 1 ? "s" : ""} need a reply within 24 hours
              </span>
            </Link>
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <ThumbsDown className="h-4 w-4" /> Top complaints
            </h2>
            {report.top_complaints.length ? (
              <ol className="space-y-3">
                {report.top_complaints.map((c, i) => (
                  <li key={c.category} className="flex items-start gap-4 rounded-xl border p-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-negative/15 font-bold text-negative">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold">{c.title}</p>
                        <Link
                          to={`/reviews?category=${c.category}&sentiment=negative&${weekLink}`}
                          className="text-sm font-semibold tabular-nums text-primary hover:underline"
                        >
                          {c.count} reviews
                        </Link>
                      </div>
                      {c.note && <p className="mt-0.5 text-sm text-muted-foreground">{c.note}</p>}
                      <Badge variant="outline" className="mt-2">
                        {CATEGORY_LABELS[c.category]}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No complaints this week.</p>
            )}
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <Heart className="h-4 w-4" /> Top praise
            </h2>
            <div className="flex flex-wrap gap-2">
              {report.top_praises.length ? (
                report.top_praises.map((p) => (
                  <span key={p.category} className="rounded-full bg-positive/10 px-3 py-1.5 text-sm">
                    <span className="font-medium">{p.title}</span>{" "}
                    <span className="tabular-nums text-muted-foreground">({p.mentions} mentions)</span>
                  </span>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No praise recorded this week.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <ListChecks className="h-4 w-4" /> Action items
            </h2>
            <ol className="space-y-2">
              {report.action_items.map((a, i) => (
                <li key={i} className="flex gap-3 rounded-xl bg-accent/50 p-3 text-sm">
                  <span className="font-bold text-primary">{i + 1}.</span>
                  {a}
                </li>
              ))}
            </ol>
          </section>

          <p className="text-xs text-muted-foreground">
            Generated {formatDate(report.generated_at)} · Counts are calculated from your data, not by AI.
          </p>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
