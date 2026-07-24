import { createFileRoute, Outlet, redirect, useLocation, Link } from "@tanstack/react-router";
import { Home as HomeIcon, ListVideo, BarChart3, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
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
