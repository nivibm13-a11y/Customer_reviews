import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud, XCircle } from "lucide-react";
import { useDropzone } from "react-dropzone";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { Upload, UploadStatus } from "@/types";

const MAX_BYTES = 5 * 1024 * 1024;

export function CsvDropzone({ onFile, disabled }: { onFile: (file: File) => void; disabled?: boolean }) {
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    accept: { "text/csv": [".csv"], "application/vnd.ms-excel": [".csv"] },
    maxFiles: 1,
    maxSize: MAX_BYTES,
    disabled,
    onDropAccepted: (files) => files[0] && onFile(files[0]),
  });
  const rejection = fileRejections[0]?.errors[0];

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-card px-6 py-14 text-center transition-all",
          isDragActive ? "scale-[1.01] border-primary bg-primary/5" : "hover:border-primary/60 hover:bg-accent/40",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <input {...getInputProps()} aria-label="Upload CSV file" />
        <motion.div
          animate={isDragActive ? { y: -6, scale: 1.1 } : { y: 0, scale: 1 }}
          className="mb-4 rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 p-4 text-white shadow-lg shadow-primary/30"
        >
          <UploadCloud className="h-8 w-8" />
        </motion.div>
        <p className="text-lg font-semibold">{isDragActive ? "Drop it here!" : "Drag & drop this week's reviews"}</p>
        <p className="mt-1 text-sm text-muted-foreground">or click to browse · CSV up to 5 MB</p>
      </div>
      {rejection && (
        <p className="mt-2 text-sm text-destructive">
          {rejection.code === "file-too-large" ? "File is larger than 5 MB." : "Please choose a .csv file."}
        </p>
      )}
    </div>
  );
}

export function CsvFormatHint() {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="mt-0.5 h-5 w-5 text-primary" />
        <div className="space-y-2 text-sm">
          <p className="font-medium">Expected columns</p>
          <code className="block rounded-md bg-muted px-2 py-1 text-xs">
            review_id, date, platform, rating, review_text
          </code>
          <p className="text-muted-foreground">
            English, Tamil and Tanglish reviews are all supported. Rows with empty text are skipped, and reviews you
            already uploaded are not analysed twice.
          </p>
          <a href="/sample-reviews.csv" download className="font-medium text-primary hover:underline">
            Download a sample CSV
          </a>
        </div>
      </div>
    </Card>
  );
}

const STATUS_BADGE: Record<UploadStatus, "secondary" | "default" | "positive" | "negative"> = {
  pending: "secondary",
  processing: "default",
  completed: "positive",
  failed: "negative",
};

export function UploadStatusBadge({ status }: { status: UploadStatus }) {
  return (
    <Badge variant={STATUS_BADGE[status]}>
      {status === "processing" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status}
    </Badge>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

export function AnalysisProgress({ upload }: { upload: Upload }) {
  const running = upload.status === "pending" || upload.status === "processing";
  return (
    <Card className="overflow-hidden p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            {running ? (
              <motion.div key="run" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </motion.div>
            ) : upload.status === "completed" ? (
              <motion.div key="done" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }}>
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </motion.div>
            ) : (
              <motion.div key="fail" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                <XCircle className="h-6 w-6 text-red-600" />
              </motion.div>
            )}
          </AnimatePresence>
          <div>
            <p className="font-semibold">{upload.filename}</p>
            <p className="text-sm text-muted-foreground">
              {running
                ? "AI is reading and tagging every review..."
                : upload.status === "completed"
                  ? "Analysis complete"
                  : "Analysis stopped"}
            </p>
          </div>
        </div>
        <UploadStatusBadge status={upload.status} />
      </div>

      <div className="mt-6 space-y-2">
        <Progress value={upload.progress_pct} />
        <div className="flex justify-between text-sm">
          <span className="font-medium tabular-nums" data-testid="progress-count">
            {upload.processed_count} / {upload.valid_rows} analysed
          </span>
          <span className="tabular-nums text-muted-foreground">{upload.progress_pct}%</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rows in file" value={upload.total_rows} />
        <Stat label="Valid reviews" value={upload.valid_rows} />
        <Stat label="Dropped (empty/invalid)" value={upload.dropped_rows} />
        <Stat label="Duplicates skipped" value={upload.duplicates_skipped} />
      </div>

      {upload.needs_review_count > 0 && (
        <p className="mt-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          {upload.needs_review_count} review(s) need a manual check (the AI could not tag them reliably).
        </p>
      )}
      {upload.error_message && (
        <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{upload.error_message}</p>
      )}
    </Card>
  );
}
