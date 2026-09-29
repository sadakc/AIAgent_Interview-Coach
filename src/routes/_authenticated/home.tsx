import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Power } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createSession } from "@/lib/interview.functions";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Start an interview — Interview Coach" },
      { name: "description", content: "Paste a job description and pick a duration to start a mock interview." },
      { property: "og:title", content: "Start an interview — Interview Coach" },
      { property: "og:description", content: "Paste a job description and pick a duration to start a mock interview." },
      { property: "og:url", content: "https://interview-aicoach.lovable.app/home" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://interview-aicoach.lovable.app/home" }],
  }),
  component: HomePage,
});

const DURATIONS = [15, 30, 45, 60] as const;

function HomePage() {
  const navigate = useNavigate();
  const create = useServerFn(createSession);
  const [jd, setJd] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = jd.trim().length > 20 && duration !== null;

  const onStart = async () => {
    if (!ready || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await create({ data: { jobDescription: jd.trim(), durationMinutes: duration! } });
      navigate({ to: "/interview/$id", params: { id: res.sessionId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-6 pb-10 pt-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h1">Welcome to your AI interview.</h1>
          <p className="mt-1 text-body text-text-secondary">
            Paste the role's job description and choose a length to begin.
          </p>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
          className="pill flex h-10 w-10 shrink-0 items-center justify-center p-0"
        >
          <Power size={18} />
        </button>
      </header>

      <section className="mb-6">
        <label className="mb-3 block text-h3">Job description</label>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="Paste the full JD here — role, responsibilities, required skills…"
          rows={10}
          className="w-full resize-none rounded-md border border-border bg-surface-elevated p-4 text-body outline-none transition-colors focus:border-accent"
        />
        <p className="mt-2 text-caption text-text-tertiary">
          {jd.trim().length} characters
        </p>
      </section>

      <section className="mb-10">
        <label className="mb-3 block text-h3">Duration</label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={`pill ${duration === d ? "pill-active" : ""}`}
            >
              {d} min
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p className="mb-4 rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">
          {error}
        </p>
      )}

      <button onClick={onStart} disabled={!ready || loading} className="btn-primary w-full">
        {loading ? "Preparing interview…" : "Start interview"}
      </button>
    </main>
  );
}
