"use client";

import { createContext, useContext, useState, useCallback, useSyncExternalStore } from "react";

interface AuthState {
  apiKey: string | null;
  userId: string | null;
  userName: string | null;
  setAuth: (apiKey: string, userId: string, userName: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  apiKey: null,
  userId: null,
  userName: null,
  setAuth: () => {},
  logout: () => {},
});

function getStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const storedKey = useSyncExternalStore(subscribeStorage, () => getStorageItem("ao_apiKey"), () => null);
  const storedUserId = useSyncExternalStore(subscribeStorage, () => getStorageItem("ao_userId"), () => null);
  const storedUserName = useSyncExternalStore(subscribeStorage, () => getStorageItem("ao_userName"), () => null);

  const [apiKey, setApiKey] = useState<string | null>(storedKey);
  const [userId, setUserId] = useState<string | null>(storedUserId);
  const [userName, setUserName] = useState<string | null>(storedUserName);

  const setAuth = useCallback((key: string, id: string, name: string) => {
    localStorage.setItem("ao_apiKey", key);
    localStorage.setItem("ao_userId", id);
    localStorage.setItem("ao_userName", name);
    setApiKey(key);
    setUserId(id);
    setUserName(name);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ao_apiKey");
    localStorage.removeItem("ao_userId");
    localStorage.removeItem("ao_userName");
    setApiKey(null);
    setUserId(null);
    setUserName(null);
  }, []);

  return (
    <AuthContext.Provider value={{ apiKey, userId, userName, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
