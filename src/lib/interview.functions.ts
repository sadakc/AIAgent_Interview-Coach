import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "google/gemini-3.6-flash";

function safeError(logContext: string, err: unknown, userMessage: string): Error {
  // Log full details server-side only
  console.error(`[${logContext}]`, err);
  return new Error(userMessage);
}

async function chatJSON<T>(system: string, user: string): Promise<T> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    console.error("[chatJSON] LOVABLE_API_KEY missing");
    throw new Error("AI service is temporarily unavailable. Please try again later.");
  }
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[chatJSON] AI gateway ${res.status}:`, body);
    throw new Error("AI service is temporarily unavailable. Please try again later.");
  }
  try {
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const content = data.choices?.[0]?.message?.content || "{}";
    return JSON.parse(content) as T;
  } catch (err) {
    throw safeError("chatJSON.parse", err, "AI service returned an unexpected response. Please try again.");
  }
}


/* ------------------------------ Create session ----------------------------- */

export const createSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ jobDescription: z.string().min(20), durationMinutes: z.number().int().min(5).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Plan the interview
    const totalQuestions = Math.max(3, Math.round(data.durationMinutes / 5));
    const plan = await chatJSON<{
      role_title: string;
      seniority: string;
      key_skills: string[];
      opening_line: string;
      questions: { text: string; focus: string }[];
    }>(
      `You are an expert technical/behavioral interviewer. From a job description, produce a structured interview plan as JSON. All spoken strings MUST be grammatically correct, natural, professional spoken English — full sentences, no fragments, no typos, no awkward phrasing, suitable for being read aloud by a text-to-speech engine. Use contractions sparingly and avoid symbols, markdown, emojis, or abbreviations that don't read well aloud.`,
      `JD:\n${data.jobDescription}\n\nProduce JSON with keys: role_title (string), seniority (string), key_skills (string[]), opening_line (one short, warm, grammatically correct spoken greeting that names the role — e.g. "Hi, thanks for joining. Today we'll be talking about the <role> position."), questions (array of exactly ${totalQuestions} items with { text: string, focus: string }). Mix behavioral, situational, and role-specific technical questions appropriate to the seniority. Every question text must be one complete, grammatically correct spoken sentence ending in a question mark.`,
    );

    const { data: session, error } = await supabase
      .from("interview_sessions")
      .insert({
        user_id: userId,
        job_description_raw: data.jobDescription,
        job_description_parsed: {
          role_title: plan.role_title,
          seniority: plan.seniority,
          key_skills: plan.key_skills,
        },
        duration_minutes: data.durationMinutes,
        role_title: plan.role_title,
      })
      .select("id")
      .single();
    if (error || !session) throw safeError("createSession.insert", error, "Could not start the interview. Please try again.");

    const { error: stateErr } = await supabase.from("interview_session_state").insert({
      session_id: session.id,
      question_plan: plan.questions,
      current_question_index: 0,
      follow_up_count: 0,
      turn_state: "speaking",
      elapsed_seconds: 0,
    });
    if (stateErr) throw safeError("createSession.state", stateErr, "Could not start the interview. Please try again.");

    // Seed first turn (opening + first question)
    const firstQ = plan.questions[0]?.text || "Tell me about yourself.";
    const opening = `${plan.opening_line} Let's begin. ${firstQ}`;

    await supabase.from("turns").insert({
      session_id: session.id,
      sequence_number: 1,
      question_index: 0,
      type: "question",
      text: opening,
    });

    return { sessionId: session.id, opening };
  });

/* ------------------------------ Submit answer ------------------------------ */

export const submitAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sessionId: z.string().uuid(), answerText: z.string().min(1), elapsedSeconds: z.number().int().nonnegative() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [{ data: session }, { data: state }, { data: turns }] = await Promise.all([
      supabase.from("interview_sessions").select("*").eq("id", data.sessionId).single(),
      supabase.from("interview_session_state").select("*").eq("session_id", data.sessionId).single(),
      supabase.from("turns").select("*").eq("session_id", data.sessionId).order("sequence_number"),
    ]);
    if (!session || !state) throw safeError("submitAnswer.load", null, "Interview session not found.");
    if (session.status !== "in_progress") return { done: true, nextQuestion: null };

    const nextSeq = (turns?.length || 0) + 1;
    await supabase.from("turns").insert({
      session_id: data.sessionId,
      sequence_number: nextSeq,
      question_index: state.current_question_index,
      type: "answer",
      text: data.answerText,
    });

    const plan = (state.question_plan as { text: string; focus: string }[]) || [];
    const totalPlanned = plan.length;
    const timeLeft = session.duration_minutes * 60 - data.elapsedSeconds;
    const timeUp = timeLeft < 45;

    // Decide next: follow-up or move on
    const currentQ = plan[state.current_question_index]?.text || "";
    const decision = await chatJSON<{
      action: "follow_up" | "next" | "end";
      text: string;
    }>(
      `You are conducting a live interview. Decide the next move.
Rules:
- Max 3 follow-ups per question, then move on.
- If time is running short, prefer moving on or ending.
- If the plan is exhausted, end.
- Never coach or hint mid-interview.
- The "text" field will be spoken aloud by a text-to-speech engine, so it MUST be one complete, grammatically correct, natural spoken English sentence with proper punctuation. No fragments, no markdown, no emojis, no abbreviations that read badly aloud.`,
      JSON.stringify({
        current_question: currentQ,
        candidate_answer: data.answerText,
        follow_ups_used_on_this_question: state.follow_up_count,
        remaining_questions_after_this: Math.max(0, totalPlanned - state.current_question_index - 1),
        seconds_remaining: timeLeft,
        upcoming_question: plan[state.current_question_index + 1]?.text || null,
      }) +
        `\n\nReturn JSON { action: "follow_up" | "next" | "end", text: string }. If "next", text = the upcoming question rephrased as one clean spoken sentence. If "end", text = a short, warm, grammatical closing line. If "follow_up", text = one grammatical follow-up question. Always a single complete sentence.`,
    );

    if (timeUp && decision.action === "follow_up") decision.action = state.current_question_index + 1 < totalPlanned ? "next" : "end";
    if (state.follow_up_count >= 3 && decision.action === "follow_up")
      decision.action = state.current_question_index + 1 < totalPlanned ? "next" : "end";

    if (decision.action === "end") {
      await supabase
        .from("interview_session_state")
        .update({ turn_state: "ended", elapsed_seconds: data.elapsedSeconds })
        .eq("session_id", data.sessionId);
      return { done: true, nextQuestion: decision.text };
    }

    let newIndex = state.current_question_index;
    let newFollowUps = state.follow_up_count;
    let turnType: "follow_up" | "question" = "follow_up";
    if (decision.action === "next") {
      newIndex += 1;
      newFollowUps = 0;
      turnType = "question";
    } else {
      newFollowUps += 1;
    }

    await supabase.from("turns").insert({
      session_id: data.sessionId,
      sequence_number: nextSeq + 1,
      question_index: newIndex,
      type: turnType,
      text: decision.text,
    });
    await supabase
      .from("interview_session_state")
      .update({
        current_question_index: newIndex,
        follow_up_count: newFollowUps,
        turn_state: "speaking",
        elapsed_seconds: data.elapsedSeconds,
      })
      .eq("session_id", data.sessionId);

    return { done: false, nextQuestion: decision.text };
  });

/* ------------------------------- End & score ------------------------------- */

export const endAndScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: session }, { data: turns }] = await Promise.all([
      supabase.from("interview_sessions").select("*").eq("id", data.sessionId).single(),
      supabase.from("turns").select("*").eq("session_id", data.sessionId).order("sequence_number"),
    ]);
    if (!session) throw safeError("endAndScore.load", null, "Interview session not found.");

    // If already scored, return existing
    const { data: existing } = await supabase.from("reports").select("*").eq("session_id", data.sessionId).maybeSingle();
    if (existing) {
      await supabase
        .from("interview_sessions")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", data.sessionId);
      return { reportId: existing.id };
    }

    const transcript = (turns || [])
      .map((t) => `${t.type.toUpperCase()}: ${t.text}`)
      .join("\n");

    const report = await chatJSON<{
      overall_score: number;
      communication_score: number;
      per_question_scores: { question: string; answer_summary: string; score: number; suggested_answer: string }[];
      top_improvements: string[];
    }>(
      `You are a senior interview coach. Score this interview honestly on a 0–100 scale. Return JSON only.`,
      `Role: ${session.role_title}\nDuration: ${session.duration_minutes} min\n\nTranscript:\n${transcript}\n\nReturn JSON with:
- overall_score (0-100 int)
- communication_score (0-100 int) — clarity, structure, filler words, pacing
- per_question_scores: array, one entry per distinct question (not follow-ups), with { question, answer_summary (2-3 sentences), score (0-100), suggested_answer (a strong 3-5 sentence example) }
- top_improvements: array of exactly 5 short actionable improvement strings.`,
    );

    const { data: inserted, error } = await supabase
      .from("reports")
      .insert({
        session_id: data.sessionId,
        overall_score: report.overall_score,
        communication_score: report.communication_score,
        per_question_scores: report.per_question_scores,
        top_improvements: report.top_improvements.slice(0, 5),
        suggested_answers: report.per_question_scores.map((q) => ({ question: q.question, suggested: q.suggested_answer })),
      })
      .select("id")
      .single();
    if (error || !inserted) throw safeError("endAndScore.insertReport", error, "Could not generate the report. Please try again.");

    await supabase
      .from("interview_sessions")
      .update({ status: "completed", ended_at: new Date().toISOString() })
      .eq("id", data.sessionId);

    return { reportId: inserted.id };
  });
