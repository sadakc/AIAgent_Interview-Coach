import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminUserRow = {
  userId: string;
  email: string | null;
  signupDate: string | null;
  total: number;
  completed: number;
  inProgress: number;
  abandoned: number;
};

export const getMyAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isAdmin: boolean }> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", context.userId)
      .maybeSingle();

    if (error) {
      console.error("[getMyAdminStatus]", error);
      return { isAdmin: false };
    }

    return { isAdmin: data?.is_admin === true };
  });

export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    const { supabase, userId } = context;

    // Verify admin via RLS-scoped client (own profile row)
    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    if (meErr || !me?.is_admin) {
      throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Get users from auth.users via admin API
    const authUsers: { id: string; email: string | null; created_at: string }[] = [];
    let page = 1;
    // Paginate; typical small user counts, but be safe
    // listUsers max perPage is 1000
    for (;;) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error("[adminListUsers.listUsers]", error);
        throw new Error("Could not load users.");
      }
      for (const u of data.users) {
        authUsers.push({ id: u.id, email: u.email ?? null, created_at: u.created_at });
      }
      if (data.users.length < 1000) break;
      page += 1;
      if (page > 20) break;
    }

    // Fetch all sessions (status + user_id) via admin (bypasses RLS)
    const { data: sessions, error: sessErr } = await supabaseAdmin
      .from("interview_sessions")
      .select("user_id, status");
    if (sessErr) {
      console.error("[adminListUsers.sessions]", sessErr);
      throw new Error("Could not load sessions.");
    }

    const counts = new Map<string, { total: number; completed: number; inProgress: number; abandoned: number }>();
    for (const s of sessions ?? []) {
      const c = counts.get(s.user_id) ?? { total: 0, completed: 0, inProgress: 0, abandoned: 0 };
      c.total += 1;
      if (s.status === "completed") c.completed += 1;
      else if (s.status === "in_progress") c.inProgress += 1;
      else if (s.status === "abandoned") c.abandoned += 1;
      counts.set(s.user_id, c);
    }

    const rows: AdminUserRow[] = authUsers.map((u) => {
      const c = counts.get(u.id) ?? { total: 0, completed: 0, inProgress: 0, abandoned: 0 };
      return {
        userId: u.id,
        email: u.email,
        signupDate: u.created_at,
        ...c,
      };
    });

    rows.sort((a, b) => b.total - a.total || (b.signupDate ?? "").localeCompare(a.signupDate ?? ""));
    return rows;
  });
