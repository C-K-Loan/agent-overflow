"use client";

import { createContext, useContext, useState, useEffect } from "react";

const THEMES = {
  light: {
    "--background": "#f6f6f6",
    "--foreground": "#1a1a1a",
    "--accent": "#f48225",
    "--accent-hover": "#da7220",
    "--blue": "#0074cc",
    "--blue-hover": "#0063b1",
    "--green": "#2f6f44",
    "--border": "#d6d9dc",
    "--header-bg": "rgba(255,255,255,0.95)",
    "--footer-bg": "#242729",
    "--footer-text": "#9199a1",
    "--card-bg": "#ffffff",
    "--code-bg": "#1e1e1e",
  },
  dark: {
    "--background": "#0d1117",
    "--foreground": "#e6edf3",
    "--accent": "#f48225",
    "--accent-hover": "#ff9640",
    "--blue": "#58a6ff",
    "--blue-hover": "#79b8ff",
    "--green": "#3fb950",
    "--border": "#30363d",
    "--header-bg": "rgba(22,27,34,0.95)",
    "--footer-bg": "#010409",
    "--footer-text": "#8b949e",
    "--card-bg": "#161b22",
    "--code-bg": "#0d1117",
  },
  midnight: {
    "--background": "#0a0a1a",
    "--foreground": "#c9d1d9",
    "--accent": "#a855f7",
    "--accent-hover": "#c084fc",
    "--blue": "#818cf8",
    "--blue-hover": "#a5b4fc",
    "--green": "#34d399",
    "--border": "#1e1e3a",
    "--header-bg": "rgba(10,10,26,0.95)",
    "--footer-bg": "#050510",
    "--footer-text": "#6b7280",
    "--card-bg": "#111127",
    "--code-bg": "#0a0a1a",
  },
  cyberpunk: {
    "--background": "#0a0a0a",
    "--foreground": "#00ff41",
    "--accent": "#ff0080",
    "--accent-hover": "#ff3399",
    "--blue": "#00d4ff",
    "--blue-hover": "#33ddff",
    "--green": "#00ff41",
    "--border": "#1a1a2e",
    "--header-bg": "rgba(10,10,10,0.95)",
    "--footer-bg": "#050505",
    "--footer-text": "#00ff4180",
    "--card-bg": "#111111",
    "--code-bg": "#0a0a0a",
  },
} as const;

type ThemeName = keyof typeof THEMES;

const ThemeContext = createContext<{
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  themes: ThemeName[];
}>({ theme: "light", setTheme: () => {}, themes: [] });

function getInitialTheme(): ThemeName {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("ao_theme") as ThemeName;
  return saved && THEMES[saved] ? saved : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(getInitialTheme);

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
