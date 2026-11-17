import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, MessageSquareText, Send, Sparkles, Trash2, User } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { RequireBusiness } from "@/components/layout/guards";
import { PageHeader, PageWrapper } from "@/components/layout/common";
import { CategoryBadge, Rating, ReviewDetailSheet, SentimentBadge } from "@/components/reviews/ReviewBits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/form";
import { CATEGORY_LABELS, SENTIMENT_LABELS } from "@/lib/labels";
import { cn, errorMessage, formatDate, formatWeek } from "@/lib/utils";
import { askService, reviewService, statsService } from "@/services/reviewLensService";
import {
  type AskFilters,
  type Business,
  CATEGORIES,
  type Category,
  type ChatTurn,
  PLATFORMS,
  type Review,
  type ReviewSource,
  type Sentiment,
  SENTIMENTS,
} from "@/types";

interface Message extends ChatTurn {
  id: number;
  sources?: ReviewSource[];
}

const STARTERS = [
  "What are customers complaining about most?",
  "Why are delivery reviews negative?",
  "What do people love about our food?",
  "Summarise the urgent complaints I should act on today.",
  "What are Tamil and Tanglish reviewers saying?",
];

function SourceCard({ source, onOpen }: { source: ReviewSource; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border bg-card p-3 text-left text-xs transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="font-mono font-semibold">{source.review_id}</span>
        <span className="text-muted-foreground">
          {source.platform} · {formatDate(source.review_date)}
        </span>
        <Rating value={source.rating} />
      </div>
      <p className="line-clamp-2 text-muted-foreground">{source.summary ?? source.snippet}</p>
      <div className="mt-2 flex gap-1">
        <SentimentBadge value={source.sentiment} />
        <CategoryBadge value={source.category} />
      </div>
    </button>
  );
}

function AskView({ business }: { business: Business }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [filters, setFilters] = useState<AskFilters>({});
  const [openReview, setOpenReview] = useState<Review | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data: weeks = [] } = useQuery({ queryKey: ["weeks", business.id], queryFn: () => statsService.weeks(business.id) });

  useEffect(() => {
    setMessages([]);
  }, [business.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  const ask = useMutation({
    mutationFn: (question: string) =>
      askService.ask(business.id, {
        question,
        history: messages.slice(-6).map(({ role, content }) => ({ role, content })),
        ...filters,
      }),
    onSuccess: (res) =>
      setMessages((m) => [...m, { id: Date.now(), role: "assistant", content: res.answer, sources: res.sources }]),
    onError: (e) => {
      setMessages((m) => m.slice(0, -1));
      toast.error(errorMessage(e, "Could not get an answer"));
    },
  });

  const send = (question: string) => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setMessages((m) => [...m, { id: Date.now(), role: "user", content: q }]);
    setInput("");
    ask.mutate(q);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const openSource = async (id: number) => {
    try {
      setOpenReview(await reviewService.get(id));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <PageWrapper>
      <PageHeader
        title="Ask your reviews"
        description={`AI answers using only ${business.name}'s reviews, with sources you can check.`}
        actions={
          messages.length > 0 && (
            <Button variant="ghost" onClick={() => setMessages([])}>
              <Trash2 /> New chat
            </Button>
          )
        }
      />

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <span className="px-1 text-xs font-medium text-muted-foreground">Search within:</span>
        <Select
          aria-label="Week filter"
          className="h-8 w-auto text-xs"
          value={filters.week_start ?? ""}
          onChange={(e) => setFilters({ ...filters, week_start: e.target.value || undefined })}
        >
          <option value="">All weeks</option>
          {weeks.map((w) => (
            <option key={w.week_start} value={w.week_start}>
              {formatWeek(w.week_start, w.week_end)}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Sentiment filter"
          className="h-8 w-auto text-xs"
          value={filters.sentiment ?? ""}
          onChange={(e) => setFilters({ ...filters, sentiment: (e.target.value as Sentiment) || undefined })}
        >
          <option value="">Any sentiment</option>
          {SENTIMENTS.map((s) => (
            <option key={s} value={s}>
              {SENTIMENT_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Category filter"
          className="h-8 w-auto text-xs"
          value={filters.category ?? ""}
          onChange={(e) => setFilters({ ...filters, category: (e.target.value as Category) || undefined })}
        >
          <option value="">Any category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Platform filter"
          className="h-8 w-auto text-xs"
          value={filters.platform ?? ""}
          onChange={(e) => setFilters({ ...filters, platform: e.target.value || undefined })}
        >
          <option value="">Any platform</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Card>

      <Card className="flex h-[calc(100vh-20rem)] min-h-[420px] flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mb-4 rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 p-4 text-white shadow-lg shadow-primary/30"
              >
                <MessageSquareText className="h-7 w-7" />
              </motion.div>
              <h3 className="text-lg font-semibold">What would you like to know?</h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                I search your reviews (English, Tamil and Tanglish) and answer with the review IDs I used.
              </p>
              <div className="mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/50 hover:bg-accent"
                  >
                    <Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}
                >
                  <div
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                      m.role === "user" ? "bg-secondary" : "bg-gradient-to-br from-primary to-fuchsia-500 text-white",
                    )}
                  >
                    {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={cn("max-w-[85%] space-y-3", m.role === "user" && "text-right")}>
                    <div
                      className={cn(
                        "inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed",
                        m.role === "user" ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted",
                      )}
                    >
                      {m.content}
                    </div>
                    {m.sources && m.sources.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Sources ({m.sources.length} reviews)
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {m.sources.map((s) => (
                            <SourceCard key={s.id} source={s} onOpen={() => openSource(s.id)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {ask.isPending && (
                <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3" aria-label="Thinking">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-2 w-2 rounded-full bg-muted-foreground"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={onSubmit} className="flex items-end gap-2 border-t p-3">
          <Textarea
            aria-label="Your question"
            rows={1}
            maxLength={500}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask about your reviews..."
            className="min-h-[44px] resize-none"
          />
          <Button type="submit" variant="gradient" size="icon" className="h-11 w-11" disabled={!input.trim() || ask.isPending}>
            <Send />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </Card>
      <ReviewDetailSheet
        review={openReview}
        onOpenChange={(o) => !o && setOpenReview(null)}
        onUpdated={setOpenReview}
      />
    </PageWrapper>
  );
}

export function AskPage() {
  return <RequireBusiness>{(business) => <AskView business={business} />}</RequireBusiness>;
}
