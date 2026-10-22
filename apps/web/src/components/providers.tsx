"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AuthResponse, User } from "@/lib/types";
import { ToastProvider } from "@/components/ui/toast";

/* -------------------------------------------------------------------------- theme */

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggle: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme): "light" | "dark" {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = theme;
  document.cookie = `cp_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  try {
    localStorage.setItem("cp_theme", theme);
  } catch {
    /* storage may be unavailable */
  }
  return resolved;
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("system");
  const [resolved, setResolved] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    const stored = (localStorage.getItem("cp_theme") as Theme | null)
      ?? (document.documentElement.dataset.theme as Theme | undefined)
      ?? "system";
    setThemeState(stored);
    setResolved(applyTheme(stored));

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      const current = (localStorage.getItem("cp_theme") as Theme | null) ?? "system";
      if (current === "system") setResolved(applyTheme("system"));
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    setResolved(applyTheme(next));
  }, []);

  const toggle = React.useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  const value = React.useMemo(
    () => ({ theme, resolved, setTheme, toggle }),
    [theme, resolved, setTheme, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside Providers");
  return context;
}

/* -------------------------------------------------------------------------- auth */

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<User | null>;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (input: Record<string, unknown>) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const current = await api.get<User>("/auth/me");
      setUser(current);
      return current;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const handler = () => setUser(null);
    window.addEventListener("cp:unauthorized", handler);
    return () => window.removeEventListener("cp:unauthorized", handler);
  }, [refresh]);

  const login = React.useCallback(async (email: string, password: string) => {
    const response = await api.post<AuthResponse>("/auth/login", { email, password });
    setUser(response.user);
    return response;
  }, []);

  const register = React.useCallback(async (input: Record<string, unknown>) => {
    const response = await api.post<AuthResponse>("/auth/register", input);
    setUser(response.user);
    return response;
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* session may already be gone */
    }
    setUser(null);
  }, []);

  const value = React.useMemo(
    () => ({ user, loading, refresh, login, register, logout, setUser }),
    [user, loading, refresh, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside Providers");
  return context;
}

/* -------------------------------------------------------------------------- root */

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () => new QueryClient({
      defaultOptions: {
        queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false },
        mutations: { retry: 0 },
      },
    })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
