import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateAppearance } from "@/components/theme-applier";
import { getMyAdminStatus } from "@/lib/admin.functions";

type Theme = "light" | "dark" | "system";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Interview Coach" },
      { name: "description", content: "Manage theme, font size, and account." },
      { property: "og:title", content: "Profile — Interview Coach" },
      { property: "og:description", content: "Manage theme, font size, and account." },
      { property: "og:url", content: "https://interview-aicoach.lovable.app/profile" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://interview-aicoach.lovable.app/profile" }],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const fetchAdminStatus = useServerFn(getMyAdminStatus);
  const [email, setEmail] = useState<string>("");
  const [theme, setTheme] = useState<Theme>("system");
  const [fontScale, setFontScale] = useState(1);
  const [ptt, setPtt] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneSaved, setPhoneSaved] = useState("");
  const [phoneStatus, setPhoneStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setEmail(data.user.email || "");
      const [{ data: p }, adminStatus] = await Promise.all([
        supabase
        .from("profiles")
        .select("theme_preference, font_scale, push_to_talk_default, phone, high_contrast")
        .eq("id", data.user.id)
        .maybeSingle(),
        fetchAdminStatus().catch(() => ({ isAdmin: false })),
      ]);
      if (p) {
        setTheme((p.theme_preference as Theme) || "system");
        setFontScale(Number(p.font_scale ?? 1));
        setPtt(!!p.push_to_talk_default);
        setContrast(!!p.high_contrast);
        setPhone(p.phone ?? "");
        setPhoneSaved(p.phone ?? "");
      }
      setIsAdmin(adminStatus.isAdmin);
    })();
  }, [fetchAdminStatus]);

  const persist = async (patch: { theme_preference?: Theme; font_scale?: number; push_to_talk_default?: boolean; high_contrast?: boolean; phone?: string | null }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    return supabase.from("profiles").update(patch).eq("id", data.user.id);
  };

  const onTheme = (t: Theme) => {
    setTheme(t);
    updateAppearance({ theme: t });
    persist({ theme_preference: t });
  };
  const onFont = (v: number) => {
    setFontScale(v);
    updateAppearance({ fontScale: v });
    persist({ font_scale: v });
  };
  const onPtt = (v: boolean) => {
    setPtt(v);
    persist({ push_to_talk_default: v });
  };

  const onContrast = (v: boolean) => {
    setContrast(v);
    updateAppearance({ contrast: v });
    persist({ high_contrast: v });
  };

  const savePhone = async () => {
    setPhoneStatus("saving");
    const trimmed = phone.trim();
    const res = await persist({ phone: trimmed === "" ? null : trimmed });
    if (res?.error) {
      setPhoneStatus("error");
    } else {
      setPhoneSaved(trimmed);
      setPhoneStatus("saved");
      setTimeout(() => setPhoneStatus("idle"), 1500);
    }
  };




  return (
    <main className="mx-auto max-w-lg px-6 pt-10">
      <h1 className="text-h1">Profile</h1>
      <p className="mt-1 text-body text-text-secondary">{email}</p>

      <section className="card-base mt-8 divide-y divide-border">
        <Row label="Theme">
          <div className="flex gap-2">
            {(["light", "dark", "system"] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => onTheme(t)}
                className={`pill min-h-[36px] px-3 text-body-sm ${theme === t ? "pill-active" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Font size">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0.85"
              max="1.35"
              step="0.05"
              value={fontScale}
              onChange={(e) => onFont(parseFloat(e.target.value))}
              className="w-40 accent-[color:var(--accent)]"
            />
            <span className="text-caption text-text-secondary w-10 text-right">
              {Math.round(fontScale * 100)}%
            </span>
          </div>
        </Row>
        <Row label="Push-to-talk default">
          <button
            onClick={() => onPtt(!ptt)}
            className={`relative h-7 w-12 shrink-0 overflow-hidden rounded-pill transition-colors ${ptt ? "bg-accent" : "bg-border"}`}
            aria-pressed={ptt}
          >
            <span
              className="absolute left-0 top-0.5 h-6 w-6 rounded-pill bg-white shadow-sm transition-transform"
              style={{ transform: ptt ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </Row>
        <Row label="High contrast">
          <button
            onClick={() => onContrast(!contrast)}
            aria-label="High contrast"
            className={`relative h-7 w-12 shrink-0 overflow-hidden rounded-pill transition-colors ${contrast ? "bg-accent" : "bg-border"}`}
            aria-pressed={contrast}
          >
            <span
              className="absolute left-0 top-0.5 h-6 w-6 rounded-pill bg-white shadow-sm transition-transform"
              style={{ transform: contrast ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </Row>
      </section>

      <section className="card-base mt-6 p-4">
        <label className="block">
          <span className="text-caption text-text-secondary">Phone number (optional)</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Contact number"
            className="mt-2 h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-body outline-none focus:border-accent"
          />
        </label>
        <p className="mt-2 text-caption text-text-tertiary">
          Not used for sign-in — just a contact number saved on your profile.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={savePhone}
            disabled={phone === phoneSaved || phoneStatus === "saving"}
            className="btn-primary min-h-[36px] px-4 text-body-sm"
          >
            {phoneStatus === "saving" ? "Saving…" : "Save"}
          </button>
          {phoneStatus === "saved" && (
            <span className="text-caption text-success">Saved</span>
          )}
          {phoneStatus === "error" && (
            <span className="text-caption text-danger">Couldn't save</span>
          )}
        </div>
      </section>

      {isAdmin && (
        <Link to="/admin" className="btn-ghost mt-8 w-full">
          Admin
        </Link>
      )}

    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <span className="text-body">{label}</span>
      {children}
    </div>
  );
}
