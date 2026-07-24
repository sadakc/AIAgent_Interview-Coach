import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

type PerQ = {
  question: string;
  answer_summary: string;
  score: number;
  suggested_answer: string;
};

export const emailReportSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const recipient = (claims as { email?: string }).email;
    if (!recipient) {
      throw new Error("No email on your account. Sign in with an email address to receive reports.");
    }

    const [{ data: session }, { data: report }] = await Promise.all([
      supabase.from("interview_sessions").select("job_description_parsed").eq("id", data.sessionId).single(),
      supabase.from("reports").select("*").eq("session_id", data.sessionId).single(),
    ]);
    if (!session || !report) throw new Error("Report not found.");

    const parsed = (session.job_description_parsed as { role?: string } | null) || {};
    const roleTitle = parsed.role || "Interview";

    try {
      const result = await sendTemplateEmail("report-summary", recipient, {
        idempotencyKey: `report-${data.sessionId}`,
        templateData: {
          roleTitle,
          overall: Math.round(Number(report.overall_score)),
          communication: Math.round(Number(report.communication_score)),
          perQuestion: (report.per_question_scores as PerQ[]) || [],
          topImprovements: (report.top_improvements as string[]) || [],
        },
      });
      return result;
    } catch (err) {
      console.error("[emailReportSummary] send failed", err);
      throw new Error("Could not send the report email right now. Please try again later.");
    }
  });
