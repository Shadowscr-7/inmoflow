"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { login as apiLogin, refreshAccessToken, type LoginResponse, setOnUnauthorized } from "@/lib/api";

interface AuthUser {
  id: string;
  tenantId: string | null;
  email: string;
  role: string;
  name: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "inmoflow_auth";

/** Decode JWT payload without a library */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const base64 = token.split(".")[1];
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  // Add 30-second buffer
  return Date.now() >= (payload.exp - 30) * 1000;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  /** Schedule a silent token refresh 1 minute before expiry */
  const scheduleRefresh = useCallback((accessToken: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const payload = decodeJwtPayload(accessToken);
    if (!payload?.exp) return;

    const msUntilExpiry = payload.exp * 1000 - Date.now();
    // Refresh 60s before expiry, but at least 5s from now
    const refreshIn = Math.max(msUntilExpiry - 60_000, 5_000);

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored) as LoginResponse;
        if (!parsed.refresh_token) { logout(); return; }

        const res = await refreshAccessToken(parsed.refresh_token);
        const newStored = { ...parsed, access_token: res.access_token };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newStored));
        setToken(res.access_token);
        scheduleRefresh(res.access_token);
      } catch {
        logout();
        window.location.href = "/login";
      }
    }, refreshIn);
  }, [logout]);

  // Register global 401 handler — try refresh before logging out
  useEffect(() => {
    setOnUnauthorized(async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as LoginResponse;
          if (parsed.refresh_token) {
            const res = await refreshAccessToken(parsed.refresh_token);
            const newStored = { ...parsed, access_token: res.access_token };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newStored));
            setToken(res.access_token);
            scheduleRefresh(res.access_token);
            return; // Refresh succeeded — don't redirect
          }
        }
      } catch {
        // Refresh also failed
      }
      logout();
      window.location.href = "/login";
    });
  }, [logout, scheduleRefresh]);

  // Restore session from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as LoginResponse;
        if (parsed.access_token && !isTokenExpired(parsed.access_token)) {
          setToken(parsed.access_token);
          setUser(parsed.user);
          scheduleRefresh(parsed.access_token);
        } else if (parsed.refresh_token) {
          // Access token expired but we have refresh token — try refreshing
          refreshAccessToken(parsed.refresh_token)
            .then((res) => {
              const newStored = { ...parsed, access_token: res.access_token };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(newStored));
              setToken(res.access_token);
              setUser(parsed.user);
              scheduleRefresh(res.access_token);
            })
            .catch(() => {
              localStorage.removeItem(STORAGE_KEY);
            })
            .finally(() => setIsLoading(false));
          return; // Don't set isLoading false yet
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // ignore
    }
    setIsLoading(false);
  }, [scheduleRefresh]);

  const loginFn = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    setToken(res.access_token);
    setUser(res.user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
    scheduleRefresh(res.access_token);
  }, [scheduleRefresh]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login: loginFn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
