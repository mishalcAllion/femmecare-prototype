// Light and dark mode. The staff console can switch; the public site and the
// consultant app always use the light brand look.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const KEY = "fc-theme";

const Ctx = createContext<{ theme: Theme; resolvedTheme: Theme; setTheme: (t: Theme) => void }>({
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => undefined,
});

function stored(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function ThemeProvider({ children, forcedTheme }: { children: ReactNode; forcedTheme?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(stored);
  const effective = forcedTheme ?? theme;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", effective === "dark");
    document.documentElement.style.colorScheme = effective;
  }, [effective]);
  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* the choice lasts for this visit only */
    }
  };
  return <Ctx.Provider value={{ theme, resolvedTheme: effective, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
