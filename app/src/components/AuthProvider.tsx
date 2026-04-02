"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    setApiKey(localStorage.getItem("ao_apiKey"));
    setUserId(localStorage.getItem("ao_userId"));
    setUserName(localStorage.getItem("ao_userName"));
  }, []);

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
