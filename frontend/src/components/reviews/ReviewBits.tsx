import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Pencil, Star } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Label, Select, Textarea } from "@/components/ui/form";
import { CATEGORY_LABELS, SENTIMENT_LABELS, URGENCY_LABELS } from "@/lib/labels";
import { errorMessage, formatDate } from "@/lib/utils";
import { reviewService } from "@/services/reviewLensService";
import {
  CATEGORIES,
  type Category,
  LANGUAGES,
  type Language,
  type Review,
  type ReviewUpdate,
  type Sentiment,
  SENTIMENTS,
  type Urgency,
  URGENCIES,
} from "@/types";

export function SentimentBadge({ value }: { value: Sentiment | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={value}>{SENTIMENT_LABELS[value]}</Badge>;
}

export function UrgencyBadge({ value }: { value: Urgency | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={value}>
      {value === "high" && <AlertTriangle className="h-3 w-3" />}
      {URGENCY_LABELS[value]}
    </Badge>
  );
}

export function CategoryBadge({ value }: { value: Category | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <Badge variant="outline">{CATEGORY_LABELS[value]}</Badge>;
}

export function Rating({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5 font-medium tabular-nums">
      {value}
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Reply copied — paste it on the platform");
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function EditTagsForm({
  review,
  onDone,
  onSaved,
}: {
  review: Review;
  onDone: () => void;
  onSaved?: (review: Review) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ReviewUpdate>({
    sentiment: review.sentiment ?? "neutral",
    category: review.category ?? "food_quality",
    urgency: review.urgency ?? "low",
    language: review.language ?? "English",
    summary: review.summary ?? "",
    suggested_reply: review.suggested_reply ?? "",
  });
  const save = useMutation({
    mutationFn: (data: ReviewUpdate) => reviewService.update(review.id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(["review", review.id], updated);
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Review updated");
      onSaved?.(updated);
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.summary?.trim()) {
      toast.error("Summary cannot be empty");
      return;
    }
    save.mutate(form);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="e-sent">Sentiment</Label>
          <Select
            id="e-sent"
            value={form.sentiment ?? ""}
            onChange={(e) => setForm({ ...form, sentiment: e.target.value as Sentiment })}
          >
            {SENTIMENTS.map((s) => (
              <option key={s} value={s}>
                {SENTIMENT_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-cat">Category</Label>
          <Select
            id="e-cat"
            value={form.category ?? ""}
            onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-urg">Urgency</Label>
          <Select
            id="e-urg"
            value={form.urgency ?? ""}
            onChange={(e) => setForm({ ...form, urgency: e.target.value as Urgency })}
          >
            {URGENCIES.map((u) => (
              <option key={u} value={u}>
                {URGENCY_LABELS[u]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-lang">Language</Label>
          <Select
            id="e-lang"
            value={form.language ?? ""}
            onChange={(e) => setForm({ ...form, language: e.target.value as Language })}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="e-sum">Summary (English)</Label>
        <Textarea
          id="e-sum"
          maxLength={500}
          value={form.summary ?? ""}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="e-reply">Suggested reply</Label>
        <Textarea
          id="e-reply"
          rows={4}
          maxLength={2000}
          value={form.suggested_reply ?? ""}
          onChange={(e) => setForm({ ...form, suggested_reply: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export function ReviewDetailSheet({
  review,
  onOpenChange,
  onUpdated,
}: {
  review: Review | null;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (review: Review) => void;
}) {
  const [editing, setEditing] = useState(false);
  const close = (open: boolean) => {
    if (!open) setEditing(false);
    onOpenChange(open);
  };
  return (
    <Sheet
      open={Boolean(review)}
      onOpenChange={close}
      title={review ? `Review ${review.review_id}` : "Review"}
      description={review ? `${review.platform} · ${formatDate(review.review_date)}` : undefined}
    >
      {review && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Rating value={review.rating} />
            <SentimentBadge value={review.sentiment} />
            <CategoryBadge value={review.category} />
            <UrgencyBadge value={review.urgency} />
            {review.language && <Badge variant="secondary">{review.language}</Badge>}
            {review.analysis_status === "needs_review" && <Badge variant="warning">Needs review</Badge>}
            {review.is_edited && <Badge variant="secondary">Edited</Badge>}
          </div>
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Original review</h4>
            <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-sm leading-relaxed">{review.review_text}</p>
          </section>
          {editing ? (
            <EditTagsForm review={review} onDone={() => setEditing(false)} onSaved={onUpdated} />
          ) : (
            <>
              <section>
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">AI summary</h4>
                <p className="text-sm">{review.summary ?? "Not analysed yet."}</p>
              </section>
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">Suggested reply</h4>
                  {review.suggested_reply && <CopyButton text={review.suggested_reply} label="Copy reply" />}
                </div>
                <p className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed">
                  {review.suggested_reply ?? "No reply suggested."}
                </p>
              </section>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit AI tags
              </Button>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
