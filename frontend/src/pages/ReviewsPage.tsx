import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Inbox, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { RequireBusiness } from "@/components/layout/guards";
import { EmptyState, PageHeader, PageWrapper } from "@/components/layout/common";
import {
  CategoryBadge,
  Rating,
  ReviewDetailSheet,
  SentimentBadge,
  UrgencyBadge,
} from "@/components/reviews/ReviewBits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { CATEGORY_LABELS, SENTIMENT_LABELS, URGENCY_LABELS } from "@/lib/labels";
import { cn, errorMessage, formatDate } from "@/lib/utils";
import { reviewService } from "@/services/reviewLensService";
import {
  type AnalysisStatus,
  type Business,
  CATEGORIES,
  type Category,
  LANGUAGES,
  type Language,
  PLATFORMS,
  type Review,
  type ReviewFilters,
  type Sentiment,
  SENTIMENTS,
  type Urgency,
  URGENCIES,
} from "@/types";

const FILTER_KEYS = [
  "sentiment",
  "category",
  "urgency",
  "platform",
  "language",
  "analysis_status",
  "date_from",
  "date_to",
  "upload_id",
  "search",
] as const;

/** Filters live in the URL so dashboard/report links can deep-link into this page. */
export function useReviewFilters() {
  const [params, setParams] = useSearchParams();
  const filters: ReviewFilters = useMemo(
    () => ({
      sentiment: (params.get("sentiment") as Sentiment) || undefined,
      category: (params.get("category") as Category) || undefined,
      urgency: (params.get("urgency") as Urgency) || undefined,
      platform: params.get("platform") || undefined,
      language: (params.get("language") as Language) || undefined,
      analysis_status: (params.get("analysis_status") as AnalysisStatus) || undefined,
      date_from: params.get("date_from") || undefined,
      date_to: params.get("date_to") || undefined,
      upload_id: params.get("upload_id") ? Number(params.get("upload_id")) : undefined,
      search: params.get("search") || undefined,
    }),
    [params],
  );
  const page = Number(params.get("page") ?? "1");
  const setFilter = (key: (typeof FILTER_KEYS)[number] | "page", value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };
  const clear = () => setParams(new URLSearchParams(), { replace: true });
  const active = FILTER_KEYS.filter((k) => params.get(k)).length;
  return { filters, page, setFilter, clear, active };
}

const PAGE_SIZE = 25;

function ReviewsView({ business }: { business: Business }) {
  const { filters, page, setFilter, clear, active } = useReviewFilters();
  const [sort, setSort] = useState("-review_date");
  const [selected, setSelected] = useState<Review | null>(null);
  const [searchText, setSearchText] = useState(filters.search ?? "");
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["reviews", business.id, filters, page, sort],
    queryFn: () => reviewService.list(business.id, { ...filters, page, page_size: PAGE_SIZE, sort }),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<Review>[]>(
    () => [
      {
        header: "Review",
        cell: ({ row }) => (
          <div className="max-w-md">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{row.original.review_id}</span>·<span>{row.original.platform}</span>·
              <span>{formatDate(row.original.review_date)}</span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-sm">{row.original.summary ?? row.original.review_text}</p>
          </div>
        ),
      },
      { header: "Rating", cell: ({ row }) => <Rating value={row.original.rating} /> },
      { header: "Sentiment", cell: ({ row }) => <SentimentBadge value={row.original.sentiment} /> },
      { header: "Category", cell: ({ row }) => <CategoryBadge value={row.original.category} /> },
      {
        header: "Urgency",
        cell: ({ row }) =>
          row.original.analysis_status === "needs_review" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
              <AlertTriangle className="h-3 w-3" /> Needs review
            </span>
          ) : (
            <UrgencyBadge value={row.original.urgency} />
          ),
      },
      {
        header: "Lang",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.language ?? "—"}</span>,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const highOnly = filters.urgency === "high";
  const needsReview = filters.analysis_status === "needs_review";

  const exportCsv = async () => {
    setExporting(true);
    try {
      await reviewService.exportCsv(business.id, filters);
    } catch (e) {
      toast.error(errorMessage(e, "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageWrapper>
      <PageHeader
        title="Reviews"
        description={`Every review for ${business.name}, tagged by AI.`}
        actions={
          <Button variant="outline" onClick={exportCsv} loading={exporting}>
            <Download /> Export CSV
          </Button>
        }
      />

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={highOnly ? "destructive" : "outline"}
            onClick={() => setFilter("urgency", highOnly ? undefined : "high")}
          >
            <AlertTriangle /> HIGH urgency only
          </Button>
          <Button
            size="sm"
            variant={needsReview ? "default" : "outline"}
            onClick={() => setFilter("analysis_status", needsReview ? undefined : "needs_review")}
          >
            Needs review
          </Button>
          <form
            className="relative ml-auto w-full sm:w-72"
            onSubmit={(e) => {
              e.preventDefault();
              setFilter("search", searchText.trim() || undefined);
            }}
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search reviews"
              placeholder="Search text, summary or ID..."
              className="h-9 pl-9"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </form>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
          <Select
            aria-label="Sentiment"
            className="h-9"
            value={filters.sentiment ?? ""}
            onChange={(e) => setFilter("sentiment", e.target.value)}
          >
            <option value="">All sentiment</option>
            {SENTIMENTS.map((s) => (
              <option key={s} value={s}>
                {SENTIMENT_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Category"
            className="h-9"
            value={filters.category ?? ""}
            onChange={(e) => setFilter("category", e.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Urgency"
            className="h-9"
            value={filters.urgency ?? ""}
            onChange={(e) => setFilter("urgency", e.target.value)}
          >
            <option value="">All urgency</option>
            {URGENCIES.map((u) => (
              <option key={u} value={u}>
                {URGENCY_LABELS[u]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Platform"
            className="h-9"
            value={filters.platform ?? ""}
            onChange={(e) => setFilter("platform", e.target.value)}
          >
            <option value="">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Language"
            className="h-9"
            value={filters.language ?? ""}
            onChange={(e) => setFilter("language", e.target.value)}
          >
            <option value="">All languages</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
          <Input
            aria-label="From date"
            type="date"
            className="h-9"
            value={filters.date_from ?? ""}
            onChange={(e) => setFilter("date_from", e.target.value)}
          />
          <Input
            aria-label="To date"
            type="date"
            className="h-9"
            value={filters.date_to ?? ""}
            onChange={(e) => setFilter("date_to", e.target.value)}
          />
          <Select aria-label="Sort" className="h-9" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="-review_date">Newest first</option>
            <option value="review_date">Oldest first</option>
            <option value="-urgency">Most urgent</option>
            <option value="rating">Lowest rating</option>
          </Select>
        </div>
        {active > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearchText("");
              clear();
            }}
          >
            <X /> Clear {active} filter{active > 1 ? "s" : ""}
          </Button>
        )}
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={Inbox}
          title="No reviews match"
          description={active ? "Try removing some filters." : "Upload a CSV to see tagged reviews here."}
        />
      ) : (
        <Card className={cn("overflow-hidden transition-opacity", isFetching && "opacity-70")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th key={h.id} className="whitespace-nowrap px-4 py-3 font-medium">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row.original)}
                    className={cn(
                      "cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50",
                      row.original.urgency === "high" && "bg-negative/[0.04]",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {data.total} review{data.total === 1 ? "" : "s"} · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setFilter("page", String(page - 1))}
              >
                <ChevronLeft /> Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setFilter("page", String(page + 1))}
              >
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <ReviewDetailSheet
        review={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onUpdated={setSelected}
      />
    </PageWrapper>
  );
}

export function ReviewsPage() {
  return <RequireBusiness>{(business) => <ReviewsView business={business} />}</RequireBusiness>;
}
