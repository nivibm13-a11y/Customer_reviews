import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, History, LayoutDashboard, RotateCw, Upload as UploadIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { RequireBusiness } from "@/components/layout/guards";
import { EmptyState, PageHeader, PageWrapper } from "@/components/layout/common";
import { AnalysisProgress, CsvDropzone, CsvFormatHint, UploadStatusBadge } from "@/components/upload/UploadParts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/feedback";
import { uploadService } from "@/services/reviewLensService";
import type { Business, Upload } from "@/types";
import { errorMessage, formatDate } from "@/lib/utils";

const isRunning = (u?: Upload) => u?.status === "pending" || u?.status === "processing";

/** Poll an upload every 1.5s while it is running. */
export function useUploadProgress(uploadId: number | null) {
  return useQuery({
    queryKey: ["upload", uploadId],
    queryFn: () => uploadService.get(uploadId as number),
    enabled: uploadId !== null,
    refetchInterval: (query) => (isRunning(query.state.data) ? 1500 : false),
  });
}

function UploadView({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const [uploadId, setUploadId] = useState<number | null>(null);
  const { data: upload } = useUploadProgress(uploadId);

  const create = useMutation({
    mutationFn: (file: File) => uploadService.create(business.id, file),
    onSuccess: (u) => {
      queryClient.setQueryData(["upload", u.id], u);
      setUploadId(u.id);
      toast.success(`${u.valid_rows} reviews queued for analysis`);
    },
    onError: (e) => toast.error(errorMessage(e, "Upload failed")),
  });

  const retry = useMutation({
    mutationFn: (id: number) => uploadService.retry(id),
    onSuccess: (u) => queryClient.setQueryData(["upload", u.id], u),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const done = upload?.status === "completed";
  useEffect(() => {
    // New reviews change stats, weeks, review lists and uploads.
    if (done) queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "upload" });
  }, [done, queryClient]);

  return (
    <PageWrapper>
      <PageHeader
        title="Upload reviews"
        description={`Analyse this week's reviews for ${business.name}.`}
        actions={
          <Button asChild variant="outline">
            <Link to="/uploads">
              <History /> Upload history
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {(!upload || !isRunning(upload)) && (
            <CsvDropzone onFile={(file) => create.mutate(file)} disabled={create.isPending} />
          )}
          {create.isPending && <Spinner label="Validating CSV..." />}
          {upload && <AnalysisProgress upload={upload} />}
          {upload?.status === "failed" && (
            <Button variant="outline" onClick={() => retry.mutate(upload.id)} loading={retry.isPending}>
              <RotateCw /> Retry remaining reviews
            </Button>
          )}
          {done && (
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient">
                <Link to="/dashboard">
                  <LayoutDashboard /> View dashboard
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to={`/reviews?upload_id=${upload.id}`}>
                  See tagged reviews <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/reviews?urgency=high">Urgent reviews</Link>
              </Button>
            </div>
          )}
        </div>
        <CsvFormatHint />
      </div>
    </PageWrapper>
  );
}

export function UploadPage() {
  return <RequireBusiness>{(business) => <UploadView business={business} />}</RequireBusiness>;
}

function UploadsView({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const { data: uploads, isLoading } = useQuery({
    queryKey: ["uploads", business.id],
    queryFn: () => uploadService.list(business.id),
    refetchInterval: (query) => (query.state.data?.some(isRunning) ? 2000 : false),
  });
  const retry = useMutation({
    mutationFn: uploadService.retry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["uploads", business.id] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <Spinner />;
  return (
    <PageWrapper>
      <PageHeader title="Upload history" description={`All CSV uploads for ${business.name}.`} />
      {!uploads?.length ? (
        <EmptyState
          icon={UploadIcon}
          title="No uploads yet"
          description="Upload your first CSV of reviews to get started."
          action={
            <Button asChild variant="gradient">
              <Link to="/upload">Upload reviews</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Uploaded</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Analysed</th>
                <th className="px-4 py-3 text-right">Skipped</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{u.filename}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <UploadStatusBadge status={u.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {u.processed_count}/{u.valid_rows}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {u.dropped_rows + u.duplicates_skipped}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.status === "failed" ? (
                      <Button size="sm" variant="outline" onClick={() => retry.mutate(u.id)}>
                        <RotateCw /> Retry
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/reviews?upload_id=${u.id}`}>View</Link>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </PageWrapper>
  );
}

export function UploadsPage() {
  return <RequireBusiness>{(business) => <UploadsView business={business} />}</RequireBusiness>;
}
