import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { refreshAccessToken, tokenStore } from "@/services/api";
import { authService, type LoginInput, type RegisterInput } from "@/services/authService";
import type { TokenResponse, User } from "@/types";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (data: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  completeOAuth: (tokens: TokenResponse) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    tokenStore.onLogout(clearSession);
    let cancelled = false;
    (async () => {
      try {
        const token = await refreshAccessToken();
        if (token && !cancelled) setUser(await authService.me());
      } catch {
        tokenStore.clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const startSession = useCallback(async (tokens: TokenResponse) => {
    tokenStore.set(tokens);
    setUser(await authService.me());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (data) => startSession(await authService.login(data)),
      register: async (data) => startSession(await authService.register(data)),
      completeOAuth: startSession,
      logout: async () => {
        const refresh = tokenStore.getRefresh();
        if (refresh) await authService.logout(refresh).catch(() => undefined);
        clearSession();
      },
      setUser,
    }),
    [user, loading, startSession, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
