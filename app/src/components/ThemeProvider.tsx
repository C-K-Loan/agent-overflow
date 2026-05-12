"use client";

import { createContext, useContext, useState, useEffect } from "react";

const THEMES = {
  dark: {
    "--background": "#0B0B0F",
    "--foreground": "#FAFAFA",
    "--muted": "#ABABBA",
    "--accent": "#f48225",
    "--accent-hover": "#ff9640",
    "--blue": "#00D4FF",
    "--blue-hover": "#33DDFF",
    "--green": "#14F195",
    "--border": "rgba(236, 228, 253, 0.12)",
    "--border-prominent": "rgba(236, 228, 253, 0.20)",
    "--header-bg": "rgba(11, 11, 15, 0.80)",
    "--footer-bg": "#050507",
    "--footer-text": "#6B6B80",
    "--card-bg": "#12121A",
    "--card-bg-hover": "#18182A",
    "--code-bg": "#0D0C11",
    "--glow-accent": "rgba(244, 130, 37, 0.15)",
    "--glow-green": "rgba(20, 241, 149, 0.12)",
    "--glow-blue": "rgba(0, 212, 255, 0.10)",
    "--gradient-brand": "linear-gradient(135deg, #9945FF, #14F195, #00D4FF)",
  },
  light: {
    "--background": "#f6f6f6",
    "--foreground": "#1a1a1a",
    "--muted": "#6b7280",
    "--accent": "#f48225",
    "--accent-hover": "#da7220",
    "--blue": "#0074cc",
    "--blue-hover": "#0063b1",
    "--green": "#2f6f44",
    "--border": "#d6d9dc",
    "--border-prominent": "#c5c8cc",
    "--header-bg": "rgba(255,255,255,0.95)",
    "--footer-bg": "#242729",
    "--footer-text": "#9199a1",
    "--card-bg": "#ffffff",
    "--card-bg-hover": "#f8f8fa",
    "--code-bg": "#1e1e1e",
    "--glow-accent": "rgba(244, 130, 37, 0.08)",
    "--glow-green": "rgba(47, 111, 68, 0.06)",
    "--glow-blue": "rgba(0, 116, 204, 0.06)",
    "--gradient-brand": "linear-gradient(135deg, #f48225, #0074cc)",
  },
  midnight: {
    "--background": "#0a0a1a",
    "--foreground": "#c9d1d9",
    "--muted": "#7a7a8e",
    "--accent": "#a855f7",
    "--accent-hover": "#c084fc",
    "--blue": "#818cf8",
    "--blue-hover": "#a5b4fc",
    "--green": "#34d399",
    "--border": "#1e1e3a",
    "--border-prominent": "#2a2a50",
    "--header-bg": "rgba(10,10,26,0.95)",
    "--footer-bg": "#050510",
    "--footer-text": "#6b7280",
    "--card-bg": "#111127",
    "--card-bg-hover": "#16163a",
    "--code-bg": "#0a0a1a",
    "--glow-accent": "rgba(168, 85, 247, 0.12)",
    "--glow-green": "rgba(52, 211, 153, 0.10)",
    "--glow-blue": "rgba(129, 140, 248, 0.10)",
    "--gradient-brand": "linear-gradient(135deg, #a855f7, #34d399)",
  },
  cyberpunk: {
    "--background": "#0a0a0a",
    "--foreground": "#00ff41",
    "--muted": "#00cc33",
    "--accent": "#ff0080",
    "--accent-hover": "#ff3399",
    "--blue": "#00d4ff",
    "--blue-hover": "#33ddff",
    "--green": "#00ff41",
    "--border": "#1a1a2e",
    "--border-prominent": "#2a2a4e",
    "--header-bg": "rgba(10,10,10,0.95)",
    "--footer-bg": "#050505",
    "--footer-text": "#00ff4180",
    "--card-bg": "#111111",
    "--card-bg-hover": "#1a1a1a",
    "--code-bg": "#0a0a0a",
    "--glow-accent": "rgba(255, 0, 128, 0.15)",
    "--glow-green": "rgba(0, 255, 65, 0.12)",
    "--glow-blue": "rgba(0, 212, 255, 0.12)",
    "--gradient-brand": "linear-gradient(135deg, #ff0080, #00ff41, #00d4ff)",
  },
} as const;

type ThemeName = keyof typeof THEMES;

const ThemeContext = createContext<{
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  themes: ThemeName[];
}>({ theme: "dark", setTheme: () => {}, themes: [] });

function getInitialTheme(): ThemeName {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem("ao_theme") as ThemeName;
  return saved && THEMES[saved] ? saved : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("dark");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(getInitialTheme());
  }, []);

  function setTheme(t: ThemeName) {
    setThemeState(t);
    localStorage.setItem("ao_theme", t);
  }

  useEffect(() => {
    const vars = THEMES[theme];
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: Object.keys(THEMES) as ThemeName[] }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeSelector() {
  const { theme, setTheme, themes } = useTheme();
  return (
    <select
      value={theme}
      onChange={(e) => setTheme(e.target.value as ThemeName)}
      className="text-xs border border-[var(--border)] rounded px-1.5 py-0.5 bg-transparent text-[var(--foreground)] cursor-pointer"
      title="Theme"
    >
      {themes.map((t) => (
        <option key={t} value={t}>
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </option>
      ))}
    </select>
  );
}
