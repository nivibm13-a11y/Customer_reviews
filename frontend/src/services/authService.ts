import { api, apiBaseUrl } from "@/services/api";
import type { TokenResponse, User } from "@/types";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  full_name?: string;
}

export interface ProfileUpdate {
  full_name?: string;
  current_password?: string;
  new_password?: string;
}

export const authService = {
  login: async (data: LoginInput): Promise<TokenResponse> => (await api.post<TokenResponse>("/auth/login", data)).data,
  register: async (data: RegisterInput): Promise<TokenResponse> =>
    (await api.post<TokenResponse>("/auth/register", data)).data,
  logout: async (refreshToken: string): Promise<void> => {
    await api.post("/auth/logout", { refresh_token: refreshToken });
  },
  me: async (): Promise<User> => (await api.get<User>("/auth/me")).data,
  updateMe: async (data: ProfileUpdate): Promise<User> => (await api.put<User>("/auth/me", data)).data,
  googleLoginUrl: (): string => `${apiBaseUrl}/api/v1/auth/google`,
};
