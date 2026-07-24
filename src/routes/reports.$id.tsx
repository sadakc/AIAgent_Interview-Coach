import { createFileRoute, useParams, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { emailReportSummary } from "@/lib/report-email.functions";
import { ChevronDown, Mail } from "lucide-react";

type Report = {
  overall_score: number;
  communication_score: number;
  per_question_scores: { question: string; answer_summary: string; score: number; suggested_answer: string }[];
  top_improvements: string[];
};

type Turn = { id: string; type: "question" | "follow_up" | "answer"; text: string; sequence_number: number };

export const Route = createFileRoute("/reports/$id")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  head: ({ params }) => ({
    meta: [
      { title: "Interview report — Interview Coach" },
      { name: "description", content: "Your scored interview report with overall and communication scores, per-question feedback, and top improvements." },
      { property: "og:title", content: "Interview report — Interview Coach" },
      { property: "og:description", content: "Your scored interview report with overall and communication scores, per-question feedback, and top improvements." },
      { property: "og:url", content: `https://interview-aicoach.lovable.app/reports/${params.id}` },
      { property: "og:type", content: "article" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `https://interview-aicoach.lovable.app/reports/${params.id}` }],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = useParams({ from: "/reports/$id" });
  const emailReport = useServerFn(emailReportSummary);
  const [report, setReport] = useState<Report | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [openQ, setOpenQ] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);
  const [showTranscript, setShowTranscript] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const sendEmail = async () => {
    setEmailState("sending");
    setEmailMsg(null);
    try {
      const res = await emailReport({ data: { sessionId: id } });
      if (res.sent) {
        setEmailState("sent");
      } else {
        setEmailState("error");
        setEmailMsg("Email was not sent.");
      }
    } catch (e) {
      setEmailState("error");
      setEmailMsg(e instanceof Error ? e.message : "Failed to send");
    }
  };

  useEffect(() => {
    (async () => {
      const [{ data: r, error }, { data: s }, { data: t }] = await Promise.all([
        supabase.from("reports").select("*").eq("session_id", id).maybeSingle(),
        supabase.from("interview_sessions").select("role_title").eq("id", id).maybeSingle(),
        supabase.from("turns").select("*").eq("session_id", id).order("sequence_number"),
      ]);
      if (error) setErr(error.message);
      if (r) setReport(r as unknown as Report);
      if (s) setRole(s.role_title);
      if (t) setTurns(t as Turn[]);
    })();
  }, [id]);

  if (err) return <ErrorState msg={err} />;
  if (!report) return <Loading />;

  const scoreColor = (n: number) => (n >= 80 ? "var(--success)" : n >= 60 ? "var(--warning)" : "var(--danger)");

  return (
    <main className="mx-auto max-w-lg px-6 pb-10 pt-8">
      <Link to="/interviews" className="text-body-sm text-text-secondary">← All interviews</Link>
      <header className="mt-4">
        <h1 className="text-h1">{role || "Interview report"}</h1>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <ScoreCard label="Overall" value={report.overall_score} color={scoreColor(report.overall_score)} />
        <ScoreCard label="Communication" value={report.communication_score} color={scoreColor(report.communication_score)} />
      </section>

      <section className="mt-4">
        <button
          onClick={sendEmail}
          disabled={emailState === "sending" || emailState === "sent"}
          className="btn-ghost inline-flex w-full items-center justify-center gap-2 border border-border"
        >
          <Mail size={16} />
          {emailState === "sending"
            ? "Sending…"
            : emailState === "sent"
              ? "Sent to your inbox"
              : "Email me this report"}
        </button>
        {emailMsg && emailState === "error" && (
          <p className="mt-2 text-body-sm text-danger">{emailMsg}</p>
        )}
      </section>


      <section className="mt-8">
        <h2 className="text-h2 mb-3">Top improvements</h2>
        <ul className="card-base divide-y divide-border">
          {report.top_improvements.map((imp, i) => (
            <li key={i} className="flex gap-3 p-4">
              <span className="text-caption text-accent">{i + 1}</span>
              <span className="text-body">{imp}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-h2 mb-3">Questions</h2>
        <ul className="space-y-3">
          {report.per_question_scores.slice(0, visibleCount).map((q, i) => {
            const open = openQ === i;
            return (
              <li key={i} className="card-base overflow-hidden">
                <button
                  onClick={() => setOpenQ(open ? null : i)}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-sm text-center leading-tight" style={{ background: `${scoreColor(q.score)}20`, color: scoreColor(q.score) }}>
                    <span className="text-body-sm font-semibold">{q.score}<span className="opacity-70">/100</span></span>
                    <span className="text-[10px] font-medium opacity-70">Q{i + 1}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-caption text-text-tertiary mb-1">Question {i + 1}</p>
                    <p className="text-body line-clamp-2">{q.question}</p>
                  </div>
                  <ChevronDown size={18} className="mt-1 shrink-0 text-text-tertiary transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
                </button>
                {open && (
                  <div className="border-t border-border p-4 space-y-3 animate-[fade-in_.25s_var(--ease-standard)]">
                    <div>
                      <p className="text-caption text-text-tertiary mb-1">Full question</p>
                      <p className="text-body-sm">{q.question}</p>
                    </div>
                    <div>
                      <p className="text-caption text-text-tertiary mb-1">Your answer</p>
                      <p className="text-body-sm">{q.answer_summary}</p>
                    </div>
                    <div>
                      <p className="text-caption text-text-tertiary mb-1">Stronger answer</p>
                      <p className="text-body-sm text-text-primary">{q.suggested_answer}</p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {visibleCount < report.per_question_scores.length ? (
          <button
            onClick={() => setVisibleCount((c) => Math.min(c + 3, report.per_question_scores.length))}
            className="btn-ghost mt-3 w-full border border-border"
          >
            More ({report.per_question_scores.length - visibleCount} left)
          </button>
        ) : report.per_question_scores.length > 3 ? (
          <p className="mt-3 text-center text-caption text-text-tertiary">All questions shown</p>
        ) : null}
      </section>

      <section className="mt-8">
        <button
          onClick={() => setShowTranscript((v) => !v)}
          className="flex w-full items-center justify-between rounded-md border border-border bg-surface-elevated p-4 text-h3"
        >
          Full transcript
          <ChevronDown size={18} style={{ transform: showTranscript ? "rotate(180deg)" : "none", transition: "transform 250ms" }} />
        </button>
        {showTranscript && (
          <ul className="mt-3 space-y-2">
            {turns.map((t) => (
              <li key={t.id} className={`rounded-sm p-3 text-body-sm ${t.type === "answer" ? "ml-6 bg-surface" : "mr-6 bg-surface-elevated border border-border"}`}>
                <p className="text-caption text-text-tertiary mb-1">{t.type === "answer" ? "You" : "Interviewer"}</p>
                {t.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 grid grid-cols-2 gap-3">
        <Link to="/home" className="btn-ghost flex items-center justify-center border border-border">Close</Link>
        <Link to="/home" className="btn-primary flex items-center justify-center">Start another</Link>
      </div>
    </main>
  );
}

function ScoreCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card-base p-4">
      <p className="text-caption text-text-tertiary">{label}</p>
      <p className="mt-1 tabular-nums" style={{ color }}>
        <span className="text-display">{value}</span>
        <span className="text-h2 opacity-60">/100</span>
      </p>
      <p className="mt-1 text-caption text-text-tertiary">out of 100</p>
    </div>
  );
}

function Loading() {
  return (
    <main className="mx-auto max-w-lg px-6 pt-16">
      <div className="mx-auto h-14 w-14 animate-spin rounded-pill border-2 border-border border-t-accent" />
      <p className="mt-6 text-center text-body text-text-secondary">Scoring your interview…</p>
    </main>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return (
    <main className="mx-auto max-w-lg px-6 pt-16 text-center">
      <p className="text-body text-danger">{msg}</p>
      <Link to="/home" className="btn-primary mt-6 inline-flex">Go home</Link>
    </main>
  );
}
