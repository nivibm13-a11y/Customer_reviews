import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Store, Trash2, UtensilsCrossed } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { AnimatedList, EmptyState, PageHeader, PageWrapper } from "@/components/layout/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/form";
import { useBusiness } from "@/hooks/useAuth";
import { businessService } from "@/services/reviewLensService";
import type { Business, BusinessInput, BusinessType } from "@/types";
import { cn, errorMessage } from "@/lib/utils";

const TYPE_LABELS: Record<BusinessType, string> = {
  restaurant: "Restaurant",
  online_store: "Online store",
  other: "Other",
};

function BusinessForm({
  initial,
  onSubmit,
  pending,
}: {
  initial?: Business;
  onSubmit: (data: BusinessInput) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<BusinessType>(initial?.business_type ?? "restaurant");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSubmit({ name: name.trim(), business_type: type });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="bname">Name</Label>
        <Input
          id="bname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Anna Biryani – T. Nagar"
          maxLength={120}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="btype">Type</Label>
        <Select id="btype" value={type} onChange={(e) => setType(e.target.value as BusinessType)}>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="gradient" className="w-full" loading={pending} disabled={!name.trim()}>
        {initial ? "Save changes" : "Create business"}
      </Button>
    </form>
  );
}

export function BusinessesPage() {
  const { businesses, current, select, loading } = useBusiness();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Business | null>(null);
  const [deleting, setDeleting] = useState<Business | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["businesses"] });
  const create = useMutation({
    mutationFn: businessService.create,
    onSuccess: (b) => {
      refresh();
      select(b.id);
      setCreating(false);
      toast.success(`${b.name} created`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: BusinessInput }) => businessService.update(id, data),
    onSuccess: () => {
      refresh();
      setEditing(null);
      toast.success("Business updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: businessService.remove,
    onSuccess: () => {
      queryClient.invalidateQueries();
      setDeleting(null);
      toast.success("Business deleted");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (loading) return <Spinner />;

  return (
    <PageWrapper>
      <PageHeader
        title="Businesses"
        description="Each business or outlet has its own reviews, dashboard and reports."
        actions={
          <Button variant="gradient" onClick={() => setCreating(true)}>
            <Plus /> New business
          </Button>
        }
      />
      {businesses.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Create your first business"
          description="Add a restaurant outlet or online store, then upload its weekly reviews."
          action={
            <Button variant="gradient" onClick={() => setCreating(true)}>
              <Plus /> New business
            </Button>
          }
        />
      ) : (
        <AnimatedList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((b) => (
            <Card
              key={b.id}
              className={cn(
                "group cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-md",
                current?.id === b.id && "ring-2 ring-primary",
              )}
              onClick={() => select(b.id)}
            >
              <div className="flex items-start justify-between">
                <div className="rounded-xl bg-primary/10 p-3 text-primary">
                  {b.business_type === "restaurant" ? <UtensilsCrossed className="h-5 w-5" /> : <Store className="h-5 w-5" />}
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${b.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(b);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${b.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleting(b);
                    }}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>
              <h3 className="mt-4 font-semibold">{b.name}</h3>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="secondary">{TYPE_LABELS[b.business_type]}</Badge>
                {current?.id === b.id && <Badge>Selected</Badge>}
              </div>
            </Card>
          ))}
        </AnimatedList>
      )}

      <Dialog open={creating} onOpenChange={setCreating} title="New business">
        <BusinessForm onSubmit={(data) => create.mutate(data)} pending={create.isPending} />
      </Dialog>
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} title="Edit business">
        {editing && (
          <BusinessForm
            initial={editing}
            onSubmit={(data) => update.mutate({ id: editing.id, data })}
            pending={update.isPending}
          />
        )}
      </Dialog>
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ""}?`}
        description="All uploads, reviews, reports and AI search data for this business will be permanently deleted."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={remove.isPending}
            onClick={() => deleting && remove.mutate(deleting.id)}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </PageWrapper>
  );
}
