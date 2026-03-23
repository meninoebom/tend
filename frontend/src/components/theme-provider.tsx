"use client";

import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {children}
    </NextThemesProvider>
  );
}

export function useTheme() {
  const { theme, setTheme } = useNextTheme();
  return {
    theme: (theme ?? "dark") as "dark" | "light",
    toggle: () => setTheme(theme === "dark" ? "light" : "dark"),
  };
}
