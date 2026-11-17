import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import type { TokenResponse } from "@/types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const REFRESH_KEY = "rl_refresh_token";

/** Access token lives in memory only; refresh token in localStorage. */
let accessToken: string | null = null;
let onLogout: (() => void) | null = null;

export const tokenStore = {
  getAccess: (): string | null => accessToken,
  getRefresh: (): string | null => localStorage.getItem(REFRESH_KEY),
  set(tokens: TokenResponse): void {
    accessToken = tokens.access_token;
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  },
  clear(): void {
    accessToken = null;
    localStorage.removeItem(REFRESH_KEY);
  },
  onLogout(handler: () => void): void {
    onLogout = handler;
  },
};

export const api = axios.create({ baseURL: `${API_URL}/api/v1`, timeout: 120_000 });
export const apiBaseUrl = API_URL;

api.interceptors.request.use((config) => {
  const token = tokenStore.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

/** Exchange the stored refresh token for new tokens (single-flight). */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;
  refreshing ??= axios
    .post<TokenResponse>(`${API_URL}/api/v1/auth/refresh`, { refresh_token: refreshToken })
    .then((res) => {
      tokenStore.set(res.data);
      return res.data.access_token;
    })
    .catch(() => {
      tokenStore.clear();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const isAuthCall = config?.url?.startsWith("/auth/") ?? false;
    if (error.response?.status === 401 && config && !config._retried && !isAuthCall) {
      config._retried = true;
      const token = await refreshAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        return api(config);
      }
      onLogout?.();
    }
    return Promise.reject(error);
  },
);
