// Shared payload types for server actions. Keep in sync with zod validators in *.functions.ts.
export type Duration = 15 | 30 | 45 | 60;
export type TurnType = "question" | "follow_up" | "answer";
export type TurnState = "listening" | "thinking" | "speaking";
export type SessionStatus = "in_progress" | "completed" | "abandoned";

export interface CreateSessionInput { jobDescription: string; durationMinutes: Duration }
export interface SubmitAnswerInput { sessionId: string; answerText: string; elapsedSeconds: number }
export interface EndAndScoreInput { sessionId: string }
export interface EmailReportInput { sessionId: string }

export interface ParsedJobDescription {
  role: string;
  seniority: string;
  skills: string[];
  responsibilities: string[];
}

export interface PerQuestionScore {
  question: string;
  answer_summary: string;
  score: number; // 0-100
  suggested_answer: string;
}
