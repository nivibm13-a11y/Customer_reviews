import { useContext } from "react";

import { AuthContext, type AuthContextValue } from "@/context/AuthContext";
import { BusinessContext, type BusinessContextValue } from "@/context/BusinessContext";
import { ThemeContext, type ThemeContextValue } from "@/context/ThemeContext";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness must be used inside BusinessProvider");
  return ctx;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
