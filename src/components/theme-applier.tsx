import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}

function applyContrast(on: boolean) {
  document.documentElement.classList.toggle("contrast", on);
}

function applyFontScale(scale: number) {
  document.documentElement.style.setProperty("--font-scale", String(scale));
}

export function ThemeApplier() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const stored = (localStorage.getItem("ic:theme") as Theme) || "system";
    const scale = parseFloat(localStorage.getItem("ic:fontScale") || "1") || 1;
    applyTheme(stored);
    applyFontScale(scale);
    applyContrast(localStorage.getItem("ic:contrast") === "1");

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const cur = (localStorage.getItem("ic:theme") as Theme) || "system";
      if (cur === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);

    // Try to load from profile
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("theme_preference, font_scale, high_contrast")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile) {
        const t = (profile.theme_preference as Theme) || "system";
        localStorage.setItem("ic:theme", t);
        localStorage.setItem("ic:fontScale", String(profile.font_scale ?? 1));
        applyTheme(t);
        applyFontScale(Number(profile.font_scale ?? 1));
        localStorage.setItem("ic:contrast", profile.high_contrast ? "1" : "0");
        applyContrast(!!profile.high_contrast);
      }
    })();

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { theme?: Theme; fontScale?: number; contrast?: boolean };
      if (detail.theme) {
        localStorage.setItem("ic:theme", detail.theme);
        applyTheme(detail.theme);
      }
      if (typeof detail.contrast === "boolean") {
        localStorage.setItem("ic:contrast", detail.contrast ? "1" : "0");
        applyContrast(detail.contrast);
      }
      if (typeof detail.fontScale === "number") {
        localStorage.setItem("ic:fontScale", String(detail.fontScale));
        applyFontScale(detail.fontScale);
      }
    };
    window.addEventListener("ic:settings-changed", handler);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("ic:settings-changed", handler);
    };
  }, []);

  return hydrated ? null : null;
}

export function updateAppearance(patch: { theme?: Theme; fontScale?: number; contrast?: boolean }) {
  window.dispatchEvent(new CustomEvent("ic:settings-changed", { detail: patch }));
}
