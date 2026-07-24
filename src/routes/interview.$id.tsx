import { createFileRoute, useNavigate, useParams, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { StateOrb, type OrbState } from "@/components/state-orb";
import { submitAnswer, endAndScore } from "@/lib/interview.functions";
import { Mic, MicOff, X, Send } from "lucide-react";

export const Route = createFileRoute("/interview/$id")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  head: ({ params }) => ({
    meta: [
      { title: "Interview in progress — Interview Coach" },
      { name: "description", content: "Live AI mock interview session with real-time voice questions, follow-ups, and transcript." },
      { property: "og:title", content: "Interview in progress — Interview Coach" },
      { property: "og:description", content: "Live AI mock interview session with real-time voice questions, follow-ups, and transcript." },
      { property: "og:url", content: `https://interview-aicoach.lovable.app/interview/${params.id}` },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `https://interview-aicoach.lovable.app/interview/${params.id}` }],
  }),
  component: InterviewPage,
});

type Turn = {
  id: string;
  sequence_number: number;
  type: "question" | "follow_up" | "answer";
  text: string;
};

function InterviewPage() {
  const { id } = useParams({ from: "/interview/$id" });
  const navigate = useNavigate();
  const submit = useServerFn(submitAnswer);
  const end = useServerFn(endAndScore);

  const [orb, setOrb] = useState<OrbState>("speaking");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [durationMin, setDurationMin] = useState<number>(30);
  const [elapsed, setElapsed] = useState(0);
  const [ptt, setPtt] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [connErr, setConnErr] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [manualText, setManualText] = useState("");

  const startTimeRef = useRef<number>(Date.now());
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recognitionEndedRef = useRef<Promise<void> | null>(null);
  const finalBufferRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const submittingRef = useRef(false);
  const pttRef = useRef(ptt);
  const endedRef = useRef(false);
  useEffect(() => { pttRef.current = ptt; }, [ptt]);
  useEffect(() => { endedRef.current = ended; }, [ended]);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setSilenceCountdown(null);
  };



  // Load session + turns + subscribe
  useEffect(() => {
    let unsubTurns: (() => void) | null = null;
    (async () => {
      const { data: session, error } = await supabase
        .from("interview_sessions")
        .select("duration_minutes, started_at, status")
        .eq("id", id)
        .single();
      if (error || !session) return setConnErr("Session not found");
      setDurationMin(session.duration_minutes);
      const startedAt = new Date(session.started_at).getTime();
      startTimeRef.current = startedAt;

      const { data: profile } = await supabase
        .from("profiles")
        .select("push_to_talk_default")
        .maybeSingle();
      if (profile) setPtt(!!profile.push_to_talk_default);

      const { data: t } = await supabase
        .from("turns")
        .select("id, sequence_number, type, text")
        .eq("session_id", id)
        .order("sequence_number");
      setTurns((t as Turn[]) || []);

      const ch = supabase
        .channel(`turns:${id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "turns", filter: `session_id=eq.${id}` },
          (payload) => {
            const row = payload.new as Turn;
            setTurns((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, row]));
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnErr("Reconnecting…");
          if (status === "SUBSCRIBED") setConnErr(null);
        });
      unsubTurns = () => supabase.removeChannel(ch);
    })();
    return () => {
      unsubTurns?.();
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
      clearSilenceTimer();
    };
  }, [id]);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 500);
    return () => clearInterval(t);
  }, []);

  // Speak new questions
  useEffect(() => {
    const last = [...turns].reverse().find((t) => t.type !== "answer");
    if (!last || spokenIdsRef.current.has(last.id)) return;
    spokenIdsRef.current.add(last.id);
    void speak(last.text);
  }, [turns]);

  const speak = async (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    // Cleanly stop any active recognition and wait for it to end before TTS,
    // so we never overlap mic capture with speaker output.
    await stopListening();
    window.speechSynthesis.cancel();
    setOrb("speaking");
    // Chrome quirk: after cancel(), an immediate speak() can drop onend.
    // A short tick lets the queue settle.
    await new Promise((r) => setTimeout(r, 60));
    if (endedRef.current) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1;
    let handled = false;
    const afterSpeak = () => {
      if (handled) return;
      handled = true;
      if (endedRef.current) return;
      setOrb("listening");
      if (!pttRef.current) startListening();
    };
    u.onend = afterSpeak;
    u.onerror = afterSpeak;
    window.speechSynthesis.speak(u);
    // Safety net: if for any reason neither onend nor onerror fires
    // (Chrome long-utterance bug), estimate duration and recover.
    const estMs = Math.max(2000, Math.min(60000, text.length * 60));
    setTimeout(afterSpeak, estMs + 1500);
  };

  // Silence auto-advance: after 10s of no speech in continuous mode, submit whatever we have.
  const SILENCE_MS = 10_000;
  const armSilenceTimer = () => {
    clearSilenceTimer();
    const deadline = Date.now() + SILENCE_MS;
    setSilenceCountdown(10);
    const tick = () => {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        setSilenceCountdown(0);
        void commitAnswer(finalBufferRef.current || "(no response)");
        return;
      }
      setSilenceCountdown(Math.ceil(remainingMs / 1000));
      silenceTimerRef.current = setTimeout(tick, 250);
    };
    silenceTimerRef.current = setTimeout(tick, 250);
  };

  const startListening = () => {
    if (recognitionRef.current) return; // already listening
    if (endedRef.current) return;
    // Don't start while TTS is speaking — the mic can't capture reliably and start() will throw.
    if (typeof window !== "undefined" && window.speechSynthesis?.speaking) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognition;
      webkitSpeechRecognition?: new () => SpeechRecognition;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    finalBufferRef.current = "";
    let resolveEnd: () => void = () => {};
    recognitionEndedRef.current = new Promise<void>((r) => { resolveEnd = r; });
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interimStr = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalBufferRef.current += r[0].transcript + " ";
        else interimStr += r[0].transcript;
      }
      setInterim(finalBufferRef.current + interimStr);
      if (!pttRef.current) armSilenceTimer();
    };
    const cleanup = () => {
      if (recognitionRef.current === rec) recognitionRef.current = null;
      setListening(false);
      clearSilenceTimer();
      resolveEnd();
    };
    rec.onerror = cleanup;
    rec.onend = cleanup;
    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
      if (!pttRef.current) armSilenceTimer();
    } catch {
      cleanup();
    }
  };

  const stopListening = async (): Promise<void> => {
    clearSilenceTimer();
    const rec = recognitionRef.current;
    const endPromise = recognitionEndedRef.current;
    if (!rec) { setListening(false); return; }
    recognitionRef.current = null;
    setListening(false);
    try { rec.stop(); } catch { try { rec.abort(); } catch { /* ignore */ } }
    if (endPromise) { try { await endPromise; } catch { /* ignore */ } }
  };

  const commitAnswer = async (textOverride?: string) => {
    if (submittingRef.current) return; // single-flight: ignore double-clicks / races
    submittingRef.current = true;
    try {
      // Stop recognition FIRST and wait for it to fully end so no late onresult
      // mutates finalBufferRef after we've read it.
      await stopListening();
      const text = (textOverride ?? finalBufferRef.current ?? "").trim();
      setInterim("");
      finalBufferRef.current = "";
      setManualText("");
      if (!text) {
        if (!pttRef.current && !endedRef.current) startListening();
        return;
      }
      setOrb("thinking");
      try {
        const res = await submit({ data: { sessionId: id, answerText: text, elapsedSeconds: elapsed } });
        if (res.done) {
          setEnded(true);
          setOrb("speaking");
          setTimeout(finish, 1500);
          return;
        }
        // Non-done: wait for realtime turn INSERT → speak effect will fire.
        // Fallback: if no new question arrives in 8s, recover so we never stay stuck.
        const beforeCount = turns.length;
        setTimeout(() => {
          if (endedRef.current) return;
          // If turns hasn't grown, the realtime message likely didn't reach us.
          // Poll once for the latest turns and, failing that, restart listening.
          void (async () => {
            const { data: latest } = await supabase
              .from("turns")
              .select("id, sequence_number, type, text")
              .eq("session_id", id)
              .order("sequence_number");
            if (latest && latest.length > beforeCount) {
              setTurns(latest as Turn[]);
              return; // speak effect will pick it up
            }
            // Truly stuck — surface state and re-open the mic.
            setOrb("listening");
            if (!pttRef.current) startListening();
          })();
        }, 8000);
      } catch (e) {
        setConnErr(e instanceof Error ? e.message : "Network error");
        setOrb("listening");
        if (!pttRef.current && !endedRef.current) startListening();
      }
    } finally {
      submittingRef.current = false;
    }
  };


  const finish = async () => {
    try {
      setOrb("thinking");
      window.speechSynthesis?.cancel();
      const res = await end({ data: { sessionId: id } });
      navigate({ to: "/reports/$id", params: { id }, replace: true });
      void res;
    } catch (e) {
      setConnErr(e instanceof Error ? e.message : "Failed to score");
    }
  };

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, interim]);

  const totalSec = durationMin * 60;
  const remaining = Math.max(0, totalSec - elapsed);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  const supportsSR = typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  return (
    <main className="fixed inset-0 flex flex-col bg-background">
      <header className="flex items-center justify-between px-6 pt-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <button
          onClick={finish}
          aria-label="End interview"
          className="btn-ghost h-11 w-11 rounded-pill p-0"
        >
          <X size={20} />
        </button>
        <div className="text-body-sm tabular-nums text-text-secondary">
          <span className="text-text-tertiary">Time left </span>{mm}:{ss}
        </div>
        <div className="w-11" />
      </header>

      {connErr && (
        <div className="mx-6 mt-3 rounded-sm border border-warning/40 bg-warning/10 p-2 text-center text-caption text-warning">
          {connErr}
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <StateOrb state={orb} />
      </div>

      <div ref={scrollRef} className="max-h-[36vh] overflow-y-auto px-6 pb-3">
        <ul className="mx-auto max-w-md space-y-3">
          {turns.map((t) => (
            <li
              key={t.id}
              className={`animate-[fade-in_.3s_var(--ease-standard)] rounded-md p-3 text-body-sm ${
                t.type === "answer"
                  ? "ml-8 bg-surface text-text-primary"
                  : "mr-8 bg-surface-elevated text-text-primary border border-border"
              }`}
            >
              <p className="text-caption text-text-tertiary mb-1">
                {t.type === "answer" ? "You" : "Interviewer"}
              </p>
              {t.text}
            </li>
          ))}
          {interim && (
            <li className="ml-8 rounded-md bg-surface p-3 text-body-sm text-text-secondary italic">
              {interim}
            </li>
          )}
        </ul>
      </div>

      <div className="border-t border-border bg-surface-elevated px-6 py-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
        {supportsSR ? (
          <div className="mx-auto flex max-w-md items-center gap-3">
            <button
              onClick={() => setPtt((v) => !v)}
              className={`pill min-h-[44px] px-3 text-body-sm ${ptt ? "pill-active" : ""}`}
              aria-pressed={ptt}
            >
              {ptt ? "PTT" : "Continuous"}
            </button>
            {ptt ? (
              <button
                onPointerDown={() => { finalBufferRef.current = ""; startListening(); }}
                onPointerUp={() => commitAnswer()}
                onPointerLeave={() => listening && commitAnswer()}
                disabled={orb === "thinking" || orb === "speaking"}
                className="btn-primary flex-1"
              >
                {listening ? "Release to send" : "Hold to talk"}
              </button>
            ) : (
              <>
                <div className="flex-1 text-body-sm text-text-secondary text-center">
                  {listening
                    ? silenceCountdown !== null && silenceCountdown <= 5
                      ? `Moving on in ${silenceCountdown}s…`
                      : "Listening…"
                    : orb === "speaking"
                      ? "Interviewer speaking"
                      : "…"}
                </div>
                <button
                  onClick={() => commitAnswer()}
                  disabled={orb === "thinking" || orb === "speaking" || submittingRef.current}
                  aria-label="Send answer"
                  className="btn-primary h-12 w-12 rounded-pill p-0"
                >
                  <Send size={18} />
                </button>
              </>
            )}
            <button
              aria-label={listening ? "Mute" : "Unmute"}
              onClick={() => {
                if (listening) void stopListening();
                else startListening();
              }}
              disabled={orb === "speaking" || orb === "thinking"}
              className="pill flex h-11 w-11 items-center justify-center p-0"
            >
              {listening ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-md gap-2">
            <input
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Type your answer…"
              className="h-12 flex-1 rounded-sm border border-border bg-surface px-3 text-body outline-none focus:border-accent"
              onKeyDown={(e) => { if (e.key === "Enter") commitAnswer(manualText); }}
            />
            <button onClick={() => commitAnswer(manualText)} disabled={!manualText.trim()} className="btn-primary px-5">
              Send
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

// Types for the Web Speech API
type SpeechRecognitionEvent = { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] & { length: number } };
type SpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
