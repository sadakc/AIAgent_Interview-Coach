import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface PerQ {
  question: string;
  answer_summary: string;
  score: number;
  suggested_answer: string;
}

interface Props {
  roleTitle?: string;
  overall?: number;
  communication?: number;
  perQuestion?: PerQ[];
  topImprovements?: string[];
}

const Email = ({
  roleTitle = "Interview",
  overall = 0,
  communication = 0,
  perQuestion = [],
  topImprovements = [],
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Your interview report — ${roleTitle}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Interview Coach — Report</Heading>
        <Text style={sub}>{roleTitle}</Text>

        <Section style={scoreRow}>
          <div style={scoreCard}>
            <Text style={scoreLabel}>Overall</Text>
            <Text style={scoreValue}>
              {overall}
              <span style={scoreDenom}>/100</span>
            </Text>
          </div>
          <div style={scoreCard}>
            <Text style={scoreLabel}>Communication</Text>
            <Text style={scoreValue}>
              {communication}
              <span style={scoreDenom}>/100</span>
            </Text>
          </div>
        </Section>

        {topImprovements.length > 0 && (
          <>
            <Heading as="h2" style={h2}>
              Top improvements
            </Heading>
            <ol style={{ paddingLeft: "20px", margin: 0 }}>
              {topImprovements.map((s, i) => (
                <li key={i} style={li}>
                  {s}
                </li>
              ))}
            </ol>
          </>
        )}

        {perQuestion.length > 0 && (
          <>
            <Heading as="h2" style={h2}>
              Per-question breakdown
            </Heading>
            {perQuestion.map((q, i) => (
              <Section key={i} style={qBlock}>
                <Text style={qMeta}>
                  Question {i + 1} · {q.score}/100
                </Text>
                <Text style={qText}>{q.question}</Text>
                <Text style={qBody}>
                  <b>Your answer:</b> {q.answer_summary}
                </Text>
                <Text style={qBody}>
                  <b>Stronger answer:</b> {q.suggested_answer}
                </Text>
                <Hr style={hr} />
              </Section>
            ))}
          </>
        )}
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `Your interview report — ${d.roleTitle || "Interview Coach"}`,
  displayName: "Interview report summary",
  previewData: {
    roleTitle: "Senior Product Manager",
    overall: 78,
    communication: 82,
    perQuestion: [
      {
        question: "Tell me about a difficult stakeholder situation.",
        answer_summary: "Described a cross-functional dispute and its resolution.",
        score: 74,
        suggested_answer:
          "Frame with STAR: situation, tension, your specific action, and the measurable outcome.",
      },
    ],
    topImprovements: [
      "Quantify results with concrete metrics.",
      "Lead with the outcome before the process.",
      "Trim filler phrases in openings.",
    ],
  },
} satisfies TemplateEntry;

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  color: "#0B0B0E",
};
const container = { padding: "24px", maxWidth: "640px", margin: "0 auto" };
const h1 = { fontSize: "22px", fontWeight: 700, margin: "0 0 4px" };
const h2 = { fontSize: "16px", fontWeight: 600, margin: "24px 0 8px" };
const sub = { color: "#6B6B75", margin: 0, fontSize: "14px" };
const scoreRow = { display: "flex", gap: "12px", margin: "20px 0" };
const scoreCard = {
  flex: 1,
  border: "1px solid #EEE",
  borderRadius: "12px",
  padding: "14px",
};
const scoreLabel = { fontSize: "12px", color: "#888", margin: 0 };
const scoreValue = { fontSize: "28px", fontWeight: 700, margin: "4px 0 0" };
const scoreDenom = { fontSize: "16px", color: "#888", fontWeight: 500 };
const li = { fontSize: "14px", margin: "4px 0" };
const qBlock = { margin: "8px 0" };
const qMeta = { fontSize: "12px", color: "#888", margin: 0 };
const qText = { fontWeight: 600, margin: "4px 0 6px", fontSize: "15px" };
const qBody = { fontSize: "14px", margin: "4px 0", lineHeight: "1.5" };
const hr = { borderColor: "#EEE", margin: "12px 0 0" };
