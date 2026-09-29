import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Trash2, Loader2 } from "lucide-react";

type Row = {
  id: string;
  role_title: string | null;
  duration_minutes: number;
  status: string;
  started_at: string;
  overall_score: number | null;
};

export const Route = createFileRoute("/_authenticated/interviews")({
  head: () => ({
    meta: [
      { title: "Interviews — Interview Coach" },
      { name: "description", content: "Your past interview sessions." },
      { property: "og:title", content: "Interviews — Interview Coach" },
      { property: "og:description", content: "Your past interview sessions." },
      { property: "og:url", content: "https://interview-aicoach.lovable.app/interviews" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://interview-aicoach.lovable.app/interviews" }],
  }),
  component: InterviewsPage,
});

function InterviewsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"date" | "score">("date");

  const load = async () => {
    setErr(null);
    const { data, error } = await supabase
      .from("interview_sessions")
      .select("id, role_title, duration_minutes, status, started_at, reports(overall_score)")
      .order("started_at", { ascending: false });
    if (error) return setErr(error.message);
    setRows(
      (data || []).map((r) => ({
        id: r.id,
        role_title: r.role_title,
        duration_minutes: r.duration_minutes,
        status: r.status,
        started_at: r.started_at,
        overall_score: (r.reports as { overall_score: number }[] | null)?.[0]?.overall_score ?? null,
      })),
    );
  };

  useEffect(() => {
    load();
  }, []);

  let list = rows || [];
  if (q.trim()) list = list.filter((r) => (r.role_title || "").toLowerCase().includes(q.toLowerCase()));
  list = [...list].sort((a, b) => {
    if (sort === "score") return (b.overall_score ?? -1) - (a.overall_score ?? -1);
    return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
  });

  return (
    <main className="mx-auto max-w-lg px-6 pt-10">
      <h1 className="text-h1">Interviews</h1>
      <div className="mt-5 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search role…"
          className="h-11 flex-1 rounded-sm border border-border bg-surface-elevated px-3 text-body outline-none focus:border-accent"
        />
        <button
          onClick={() => setSort(sort === "date" ? "score" : "date")}
          className="pill min-h-[44px] px-4 text-body-sm"
        >
          {sort === "date" ? "Date" : "Score"}
        </button>
      </div>

      {err && <p className="mt-4 text-body-sm text-danger">{err}</p>}
      {rows === null ? (
        <SkeletonList />
      ) : list.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-body text-text-secondary">No interviews yet.</p>
          <Link to="/home" className="btn-primary mt-4 inline-flex">Start your first</Link>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {list.map((r) => (
            <InterviewRow
              key={r.id}
              row={r}
              onDeleted={(id) => setRows((prev) => (prev ? prev.filter((x) => x.id !== id) : prev))}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function InterviewRow({ row: r, onDeleted }: { row: Row; onDeleted: (id: string) => void }) {
  const inProgress = r.status === "in_progress";
  const linkProps = inProgress
    ? { to: "/interview/$id" as const, params: { id: r.id } }
    : { to: "/reports/$id" as const, params: { id: r.id } };
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setConfirming(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setConfirming(false), 4000);
  };

  const cancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirming(false);
  };

  const doDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setDeleting(true);
    setError(null);
    const { error } = await supabase.from("interview_sessions").delete().eq("id", r.id);
    if (error) {
      setDeleting(false);
      setError(error.message);
      return;
    }
    onDeleted(r.id);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <li>
      <div className="card-base flex items-center gap-3 p-4 transition-colors hover:border-accent/50">
        <Link {...linkProps} className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-h3">{r.role_title || "Untitled role"}</p>
            <p className="mt-1 text-body-sm text-text-secondary">
              {r.duration_minutes} min · {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
              {inProgress ? " · Tap to resume" : ""}
            </p>
            {error && <p className="mt-1 text-caption text-danger">{error} · Tap trash to retry.</p>}
          </div>
          <ScoreBadge score={r.overall_score} status={r.status} />
        </Link>
        {confirming ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={doDelete}
              disabled={deleting}
              aria-label="Confirm delete"
              className="pill min-h-[36px] bg-danger px-3 text-body-sm text-white disabled:opacity-60"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : "Delete"}
            </button>
            <button
              onClick={cancel}
              disabled={deleting}
              aria-label="Cancel delete"
              className="pill min-h-[36px] px-3 text-body-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={armConfirm}
            aria-label="Delete interview"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </li>
  );
}

function ScoreBadge({ score, status }: { score: number | null; status: string }) {
  if (status === "in_progress") return <span className="text-caption text-warning">In progress</span>;
  if (score === null) return <span className="text-caption text-text-tertiary">—</span>;
  const color = score >= 80 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--danger)";
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md leading-tight" style={{ background: `${color}20`, color }}>
      <span className="text-h3 tabular-nums">{score}</span>
      <span className="text-[10px] font-medium opacity-70">/ 100</span>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="mt-5 space-y-3">
      {[1, 2, 3].map((i) => (
        <li key={i} className="card-base h-20 animate-pulse" />
      ))}
    </ul>
  );
}
