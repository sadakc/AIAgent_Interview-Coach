import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { adminListUsers, type AdminUserRow } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Interview Coach" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const fetchUsers = useServerFn(adminListUsers);
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchUsers();
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) navigate({ to: "/home", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchUsers, navigate]);

  if (rows === null) {
    return (
      <main className="mx-auto max-w-4xl px-6 pt-10">
        <div className="card-base h-40 animate-pulse" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 pt-10">
      <h1 className="text-h1">Admin</h1>
      <p className="mt-1 text-body-sm text-text-secondary">
        {rows.length} {rows.length === 1 ? "user" : "users"}
      </p>

      {/* Desktop table */}
      <div className="mt-6 hidden overflow-hidden rounded-lg border border-border md:block">
        <table className="w-full text-body-sm">
          <thead className="bg-surface-elevated text-text-secondary">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Signed up</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium text-right">Completed</th>
              <th className="px-4 py-3 font-medium text-right">In progress</th>
              <th className="px-4 py-3 font-medium text-right">Abandoned</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-t border-border">
                <td className="px-4 py-3">{r.email ?? "—"}</td>
                <td className="px-4 py-3 text-text-secondary">
                  {r.signupDate ? new Date(r.signupDate).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.total}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.completed}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.inProgress}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.abandoned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.userId} className="card-base p-4">
            <p className="text-h3 break-all">{r.email ?? "—"}</p>
            <p className="mt-1 text-body-sm text-text-secondary">
              Signed up {r.signupDate ? new Date(r.signupDate).toLocaleDateString() : "—"}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-body-sm">
              <span><span className="tabular-nums font-medium">{r.total}</span> total</span>
              <span className="text-text-secondary">
                <span className="tabular-nums">{r.completed}</span> completed ·{" "}
                <span className="tabular-nums">{r.inProgress}</span> in progress ·{" "}
                <span className="tabular-nums">{r.abandoned}</span> abandoned
              </span>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
