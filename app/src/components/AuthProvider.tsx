"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

interface AuthState {
  apiKey: string | null;
  userId: string | null;
  userName: string | null;
  rawKey: string | null;
  setAuth: (token: string, userId: string, userName: string, rawKey?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  apiKey: null,
  userId: null,
  userName: null,
  rawKey: null,
  setAuth: () => {},
  logout: () => {},
});

function ls(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

function jwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // refresh if < 5 min left
    return payload.exp * 1000 < Date.now() + 5 * 60 * 1000;
  } catch { return true; }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Start null (SSR-safe) — populate from localStorage in useEffect to avoid
  // React hydration mismatch (#418). Auth state loads after first paint.
  const [apiKey,   setApiKey]   = useState<string | null>(null);
  const [userId,   setUserId]   = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [rawKey,   setRawKey]   = useState<string | null>(null);

  useEffect(() => {
    const token   = ls("ao_apiKey");
    const id      = ls("ao_userId");
    const name    = ls("ao_userName");
    const raw     = ls("ao_rawKey");

    setRawKey(raw);
    setUserId(id);
    setUserName(name);

    // Auto-refresh JWT if expired (or expiring soon) and we have the raw key
    if (token && raw && jwtExpired(token)) {
      fetch("/api/auth/token", { method: "POST", headers: { Authorization: `Bearer ${raw}` } })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.token) {
            localStorage.setItem("ao_apiKey", data.token);
            if (data.user?.id)   { localStorage.setItem("ao_userId",   data.user.id);   setUserId(data.user.id); }
            if (data.user?.name) { localStorage.setItem("ao_userName", data.user.name); setUserName(data.user.name); }
            setApiKey(data.token);
          } else {
            setApiKey(token); // use expired token as fallback, server will 401
          }
        })
        .catch(() => setApiKey(token));
    } else {
      setApiKey(token);
    }

    function onStorage(e: StorageEvent) {
      if (e.key === "ao_apiKey")   setApiKey(e.newValue);
      if (e.key === "ao_userId")   setUserId(e.newValue);
      if (e.key === "ao_userName") setUserName(e.newValue);
      if (e.key === "ao_rawKey")   setRawKey(e.newValue);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setAuth = useCallback((token: string, id: string, name: string, raw?: string) => {
    localStorage.setItem("ao_apiKey",   token);
    localStorage.setItem("ao_userId",   id);
    localStorage.setItem("ao_userName", name);
    setApiKey(token);
    setUserId(id);
    setUserName(name);
    if (raw) {
      localStorage.setItem("ao_rawKey", raw);
      setRawKey(raw);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ao_apiKey");
    localStorage.removeItem("ao_userId");
    localStorage.removeItem("ao_userName");
    // Keep ao_rawKey so user can re-login without re-entering their key
    setApiKey(null);
    setUserId(null);
    setUserName(null);
  }, []);

  return (
    <AuthContext.Provider value={{ apiKey, userId, userName, rawKey, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
