import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  session_id: string;
  overall_score: number;
  communication_score: number;
  created_at: string;
  role_title: string | null;
};

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Interview Coach" },
      { name: "description", content: "Scored feedback from your interviews." },
      { property: "og:title", content: "Reports — Interview Coach" },
      { property: "og:description", content: "Scored feedback from your interviews." },
      { property: "og:url", content: "https://interview-aicoach.lovable.app/reports" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://interview-aicoach.lovable.app/reports" }],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const load = async (offset: number) => {
      setErr(false);
      const { data, error } = await supabase
        .from("reports")
        .select("session_id, overall_score, communication_score, created_at, interview_sessions(role_title)")
        .order("created_at", { ascending: false })
        .range(offset, offset + 19);
      if (error) return setErr(true);
      setHasMore((data || []).length === 20);
      const mapped = (data || []).map((r) => ({
          session_id: r.session_id,
          overall_score: r.overall_score,
          communication_score: r.communication_score,
          created_at: r.created_at,
          role_title:
            (r.interview_sessions as { role_title: string | null } | null)?.role_title ?? null,
        }));
      setRows((prev) => (offset === 0 ? mapped : [...(prev || []), ...mapped]));
  };
  useEffect(() => {
    load(0);
  }, []);

  return (
    <main className="mx-auto max-w-lg px-6 pt-10">
      <h1 className="text-h1">Reports</h1>
      {err && (
        <p className="mt-4 text-body-sm text-danger">
          Couldn't load reports.{" "}
          <button onClick={() => load(rows?.length ?? 0)} className="underline">Retry</button>
        </p>
      )}
      {rows === null ? (
        <ul className="mt-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <li key={i} className="card-base h-24 animate-pulse" />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="mt-16 text-center text-body text-text-secondary">
          Finish an interview to see reports here.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map((r) => (
            <li key={r.session_id}>
              <Link to="/reports/$id" params={{ id: r.session_id }} className="card-base flex items-center gap-4 p-4">
                <div className="flex-1">
                  <p className="text-h3">{r.role_title || "Untitled role"}</p>
                  <p className="mt-1 text-body-sm text-text-secondary">Communication {r.communication_score}</p>
                </div>
                <div
                  className="flex h-16 w-16 flex-col items-center justify-center rounded-md leading-tight"
                  style={{
                    background: `${r.overall_score >= 80 ? "var(--success)" : r.overall_score >= 60 ? "var(--warning)" : "var(--danger)"}20`,
                    color: r.overall_score >= 80 ? "var(--success)" : r.overall_score >= 60 ? "var(--warning)" : "var(--danger)",
                  }}
                >
                  <span className="text-h1 tabular-nums">{r.overall_score}</span>
                  <span className="text-[10px] font-medium opacity-70">/ 100</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button
          onClick={async () => { setLoadingMore(true); await load(rows?.length ?? 0); setLoadingMore(false); }}
          disabled={loadingMore}
          className="pill mx-auto mb-8 mt-4 flex min-h-[44px] px-5 text-body-sm"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </main>
  );
}
