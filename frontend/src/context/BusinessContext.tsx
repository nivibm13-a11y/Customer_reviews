import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { businessService } from "@/services/reviewLensService";
import type { Business } from "@/types";

const STORAGE_KEY = "rl_business_id";

export interface BusinessContextValue {
  businesses: Business[];
  current: Business | null;
  loading: boolean;
  select: (id: number) => void;
}

export const BusinessContext = createContext<BusinessContextValue | null>(null);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ["businesses"],
    queryFn: businessService.list,
    enabled: Boolean(user),
  });

  const current = useMemo(
    () => businesses.find((b) => b.id === selectedId) ?? businesses[0] ?? null,
    [businesses, selectedId],
  );

  useEffect(() => {
    if (current && current.id !== selectedId) setSelectedId(current.id);
  }, [current, selectedId]);

  const select = useCallback((id: number) => {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const value = useMemo(
    () => ({ businesses, current, loading: isLoading, select }),
    [businesses, current, isLoading, select],
  );
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}
