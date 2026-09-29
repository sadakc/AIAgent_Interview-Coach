import { createFileRoute, Outlet, redirect, useLocation, Link } from "@tanstack/react-router";
import { Home as HomeIcon, ListVideo, BarChart3, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

async function waitForHashSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash ?? "";
  // Supabase magic-link redirect: #access_token=...&refresh_token=...
  // or PKCE recovery: #error=...
  const hasAuthHash = /access_token=|refresh_token=|type=recovery|error=/.test(hash);
  if (!hasAuthHash) return false;

  return await new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      sub?.data.subscription.unsubscribe();
      clearTimeout(timeout);
      // Strip the hash so a refresh doesn't re-trigger this path.
      try {
        const url = new URL(window.location.href);
        url.hash = "";
        window.history.replaceState({}, "", url.toString());
      } catch {}
      resolve(ok);
    };
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) finish(true);
    });
    // Immediate check in case the exchange already completed.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(true);
    });
    const timeout = setTimeout(() => finish(false), 8000);
  });
}

function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-accent"
          role="status"
          aria-label="Signing you in"
        />
        <p className="text-body text-text-secondary">Signing you in…</p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  pendingComponent: AuthLoading,
  pendingMs: 0,
  beforeLoad: async () => {
    // If the URL carries a magic-link hash, wait for Supabase to exchange it
    // before checking auth — otherwise getUser() races the hash processing
    // and returns "no user" on the first click.
    await waitForHashSession();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const tabs = [
  { to: "/home", label: "Home", icon: HomeIcon },
  { to: "/interviews", label: "Interviews", icon: ListVideo },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/profile", label: "Profile", icon: User },
] as const;

function AuthedLayout() {
  const loc = useLocation();
  const hideTabs = loc.pathname.startsWith("/interview/");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex-1 pb-24">
        <Outlet />
      </div>
      {!hideTabs && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-elevated/90 backdrop-blur"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="mx-auto flex max-w-lg items-stretch justify-around">
            {tabs.map((t) => {
              const active =
                loc.pathname === t.to || loc.pathname.startsWith(t.to + "/");
              const Icon = t.icon;
              return (
                <li key={t.to} className="flex-1">
                  <Link
                    to={t.to}
                    className="flex min-h-[64px] flex-col items-center justify-center gap-1 py-2 transition-colors"
                    style={{ color: active ? "var(--accent)" : "var(--text-tertiary)" }}
                  >
                    <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                    <span className="text-caption">{t.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
