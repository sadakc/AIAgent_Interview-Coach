# AI Interview Coach — Lovable Handoff Package

> This package is the Part C deliverable from the Build Brief: everything needed to hand the app over to Lovable and get a working build. It translates the original spec (written for a custom NestJS + React Native stack) into Lovable's actual stack (Supabase + React/Tailwind/shadcn) with no loss of functionality, and flags every place that translation required a decision.

---

## 0. How to use this package

1. Read **Section 6 (Deviations)** first — it explains why this package targets Lovable's native stack instead of the brief's original one.
2. Paste the **"First message to send Lovable"** block at the end of this doc into a new Lovable project (or `create_project` / `send_message`) to kick off the build.
3. Keep this file in the repo as the source of truth; update it if Lovable's implementation diverges further.

---

## 1. Product Summary (unchanged from brief)

Premium, mobile-first, voice-first AI interview coach. Flow: **Home → Paste JD → Select Duration (15/30/45/60 min) → Voice Interview → Interview Report.**

The frontend never generates questions or scores answers — that's all backend/AI logic. Out of scope for this phase: resume upload, live coaching, video interviews, emotion/filler-word detection, gamification, company-specific modes, retry mode. Architecture should not need refactoring to add these later.

---

## 2. Data Model (Supabase / Postgres)

```sql
-- Supabase Auth's built-in auth.users covers OTP identity.
-- This table extends it with app-specific profile fields.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  font_scale numeric default 1.0,           -- accessibility: dynamic font size
  push_to_talk_default boolean default false, -- vs. continuous listening
  theme_preference text default 'system',    -- 'light' | 'dark' | 'system'
  created_at timestamptz default now()
);

create type interview_status as enum ('in_progress', 'completed', 'abandoned');

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_description_raw text not null,
  job_description_parsed jsonb,        -- { role, seniority, skills[], responsibilities[] }
  duration_minutes int not null check (duration_minutes in (15, 30, 45, 60)),
  status interview_status not null default 'in_progress',
  started_at timestamptz default now(),
  ended_at timestamptz
);

create type turn_type as enum ('question', 'follow_up', 'answer');

create table public.turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  sequence_number int not null,
  type turn_type not null,
  text text not null,
  audio_ref text,               -- Supabase Storage path, only if audio retention enabled
  created_at timestamptz default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.interview_sessions(id) on delete cascade,
  overall_score numeric not null,
  communication_score numeric not null,
  per_question_scores jsonb not null,   -- [{ question, answer_summary, score, suggested_answer }]
  top_improvements jsonb not null,      -- string[max 5]
  suggested_answers jsonb,
  created_at timestamptz default now()
);

-- Live session state, replaces the brief's Redis requirement (see Deviations).
create table public.interview_session_state (
  session_id uuid primary key references public.interview_sessions(id) on delete cascade,
  question_plan jsonb not null,       -- full ordered question set, generated up front
  current_question_index int not null default 0,
  follow_up_count int not null default 0,
  turn_state text not null default 'listening', -- 'listening' | 'thinking' | 'speaking'
  elapsed_seconds int not null default 0,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.turns enable row level security;
alter table public.reports enable row level security;
alter table public.interview_session_state enable row level security;

-- Baseline RLS: users only see their own data.
create policy "own profile" on public.profiles for all using (auth.uid() = id);
create policy "own sessions" on public.interview_sessions for all using (auth.uid() = user_id);
create policy "own turns" on public.turns for all using (
  auth.uid() = (select user_id from public.interview_sessions s where s.id = session_id)
);
create policy "own reports" on public.reports for all using (
  auth.uid() = (select user_id from public.interview_sessions s where s.id = session_id)
);
create policy "own session state" on public.interview_session_state for all using (
  auth.uid() = (select user_id from public.interview_sessions s where s.id = session_id)
);
```

Kept normalized and additive, per the brief — future fields (resume link, retry-of-turn reference) are new nullable columns, not restructures.

---

## 3. API Contract

Implemented as **Supabase Edge Functions** (Deno/TypeScript), called from the client via `supabase.functions.invoke(name, { body })`. Grouped by the same three logical services as the brief — kept as separate function folders so each owns its own concern even though all run on Supabase's managed backend.

### 3.1 Core Backend (`supabase/functions/core-*`)

| Function | Method | Payload in | Payload out |
|---|---|---|---|
| Auth | — | Use Supabase Auth directly: `signInWithOtp({ email })` or `{ phone })`, then `verifyOtp({ token, type: 'email' \| 'sms' })`. No custom endpoint needed — Supabase issues the JWT. |
| `interviews-list` | GET-style invoke | `{ page, pageSize, search?, sort? }` | `{ items: InterviewListItem[], total, page }` |
| `interviews-get` | GET-style invoke | `{ sessionId }` | `InterviewSessionDetail` |
| `interviews-report-get` | GET-style invoke | `{ sessionId }` | `Report \| { status: 'pending' }` |

### 3.2 Interview Engine (`supabase/functions/engine-*`)

| Function | Payload in | Payload out |
|---|---|---|
| `engine-create-session` | `{ jobDescription: string, durationMinutes: 15\|30\|45\|60 }` | `{ sessionId, status: 'ready', questionPlanSize }` — parses JD, generates full question plan, writes `interview_session_state` |
| `engine-turn` (invoked per user utterance, or proxied through the realtime channel below) | `{ sessionId, transcriptText }` | `{ turnState, nextPrompt?, ttsAudioUrl?, sessionEnded }` |

### 3.3 Reporting Engine (`supabase/functions/reporting-*`)

| Function | Trigger | Behavior |
|---|---|---|
| `reporting-generate` | Invoked by `engine-turn` on session end (or a DB trigger on `interview_sessions.status = 'completed'`) | Async job: reads full transcript from `turns`, produces `Report` row. Client polls `interviews-report-get` until it returns a row instead of `{status:'pending'}`. |

### 3.4 Realtime turn loop (replaces the brief's raw WebSocket)

Supabase Realtime **Broadcast** channel per session: `interview:{sessionId}`

| Direction | Event | Payload |
|---|---|---|
| Client → Server | `audio_chunk` | `{ chunk: base64, seq }` |
| Client → Server | `end_of_turn` | `{}` |
| Server → Client | `partial_transcript` | `{ text, isFinal }` |
| Server → Client | `interviewer_audio` | `{ audioUrl }` or streamed chunk, depending on TTS provider |
| Server → Client | `turn_state` | `{ state: 'listening' \| 'thinking' \| 'speaking' }` |
| Server → Client | `session_end` | `{ reason: 'completed' \| 'time_up' }` |

Reconnect rule: on drop, client rejoins the channel with the same `sessionId`; server resumes from `interview_session_state.current_question_index` — never restarts the interview.

### 3.5 Shared TypeScript types

```ts
export interface JobDescriptionParsed {
  role: string;
  seniority: string;
  skills: string[];
  responsibilities: string[];
}

export type InterviewStatus = 'in_progress' | 'completed' | 'abandoned';

export interface InterviewSessionDetail {
  id: string;
  jobDescriptionRaw: string;
  jobDescriptionParsed: JobDescriptionParsed;
  durationMinutes: 15 | 30 | 45 | 60;
  status: InterviewStatus;
  startedAt: string;
  endedAt?: string;
}

export interface InterviewListItem {
  id: string;
  roleTitle: string;
  durationMinutes: number;
  startedAt: string;
  overallScore?: number;
  status: InterviewStatus;
}

export type TurnType = 'question' | 'follow_up' | 'answer';

export interface Turn {
  id: string;
  sessionId: string;
  sequenceNumber: number;
  type: TurnType;
  text: string;
  audioRef?: string;
  createdAt: string;
}

export interface PerQuestionScore {
  question: string;
  answerSummary: string;
  score: number;
  suggestedAnswer: string;
}

export interface Report {
  id: string;
  sessionId: string;
  overallScore: number;
  communicationScore: number;
  perQuestionScores: PerQuestionScore[];
  topImprovements: string[]; // max 5
  suggestedAnswers?: Record<string, string>;
}

export type TurnState = 'listening' | 'thinking' | 'speaking';
```

---

## 4. AI / Interview Engine Logic (unchanged responsibilities, mapped to edge functions)

1. **JD Parsing** — one LLM call inside `engine-create-session`, output validated against the `JobDescriptionParsed` schema before it's persisted.
2. **Question Plan Generation** — full ordered set generated up front in the same call, sized to the selected duration. Never one-question-at-a-time generation.
3. **Follow-up Logic** — after each answer, evaluate sufficiency; vague/incomplete → follow-up, hard cap 3 per question, tracked in `interview_session_state.follow_up_count`.
4. **Duration Management** — `engine-turn` checks `elapsed_seconds` vs. plan on every turn; compresses remaining questions or wraps up gracefully near the limit. Never hard-cuts mid-answer.
5. **Transcript Recording** — every turn written to `turns` as it happens, not reconstructed afterward.
6. **No live scoring** — `engine-turn` never returns a score; scoring only exists in `reporting-generate` output.
7. **Report Generation** — async, triggered on session completion; consumes the full transcript for overall score, per-question score, communication score, top 5 improvements, suggested stronger answers.

Keep JD-parsing, question-generation, follow-up-evaluation, and scoring as **separate prompts/functions coordinated by one orchestrator** inside the engine functions — not a single mega-prompt, per the brief.

---

## 5. Screens & Interaction Rules

**Navigation:** persistent bottom tab bar, 4 tabs, consistent everywhere — Home, Interviews, Reports, Profile.

| Screen | Must include |
|---|---|
| **Auth** | Single input (email/phone toggle) → OTP code entry → done. No password field anywhere. |
| **Home** | Large JD paste area (primary action). Duration selector: 4 large tappable options (15/30/45/60). One primary "Start Interview" button, disabled until JD present + duration selected. No other setup fields — never ask the user to re-enter role/seniority/skills. |
| **Interview (live)** | Full-screen, minimal chrome. Central animated state indicator: listening / thinking / speaking (not just a label). Auto-scrolling live transcript. Push-to-talk toggle alongside continuous listening. Subtle elapsed/remaining time indicator. No scores, hints, or coaching visible mid-interview. Graceful reconnect UI on connection drop — never a blank screen. |
| **Interview Report** | Overall score prominent at top. Communication score. Per-question breakdown as expandable cards (question, answer summary, score, suggested stronger answer). Top 5 improvements as a scannable list. Full transcript, collapsed by default, expandable, short line lengths, clear turn separation. |
| **Interviews (history)** | List: role/JD title, date, duration, overall score at a glance. Search + sort controls. Tap → opens that report. |
| **Profile** | Account info, auth/session management, settings (theme, push-to-talk vs. continuous default, font size). |

**Interaction rules (apply everywhere):**
- One question at a time during interviews; never show multiple queued.
- No blank screens — every load/error state has a visible loading indicator, error message, and retry action.
- Minimize taps — no confirmation dialogs or multi-step forms where one screen will do.
- Consistent spacing/typography tokens reused across all screens (Section 6 below), never per-screen one-off styling.
- Light and dark mode throughout, not an afterthought.
- Accessibility: dynamic font sizes, screen reader support, high-contrast mode, large tap targets.

---

## 6. Design Tokens

Aesthetic reference: ChatGPT / Linear / Notion / ElevenLabs — minimalist, rounded cards, generous whitespace, large touch targets, one confident accent color, restrained motion.

### Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#FFFFFF` | `#0B0B0E` | app background |
| `surface` | `#F7F7F8` | `#151517` | cards, inputs |
| `surface-elevated` | `#FFFFFF` | `#1D1D20` | modals, sheets |
| `border` | `#E5E5E8` | `#2A2A2E` | dividers, card borders |
| `text-primary` | `#111113` | `#F2F2F3` | headings, primary copy |
| `text-secondary` | `#5B5B63` | `#A6A6AD` | supporting copy |
| `text-tertiary` | `#8E8E96` | `#75757D` | captions, timestamps |
| `accent` | `#6D5EF5` | `#8B7BFF` | primary actions, active states |
| `accent-foreground` | `#FFFFFF` | `#0B0B0E` | text/icons on accent |
| `success` | `#1E9E6B` | `#3ECF8E` | positive score bands |
| `warning` | `#C77D14` | `#E8A33D` | mid score bands |
| `danger` | `#D6432F` | `#F0665A` | errors, low score bands |
| `focus-ring` | `#6D5EF5` | `#8B7BFF` | keyboard focus outline |

### Typography

Font: **Inter** (system fallback: `-apple-system, Segoe UI, Roboto, sans-serif`).

| Token | Size / Line-height | Weight | Use |
|---|---|---|---|
| `display` | 32 / 40 | 700 | overall score, hero numbers |
| `h1` | 24 / 32 | 700 | screen titles |
| `h2` | 20 / 28 | 600 | section headers |
| `h3` | 17 / 24 | 600 | card titles |
| `body` | 15 / 22 | 400 | default copy |
| `body-sm` | 13 / 18 | 400 | secondary copy |
| `caption` | 12 / 16 | 500 | timestamps, labels |

All sizes scale with the user's `font_scale` profile setting (accessibility requirement).

### Spacing scale (4px base)

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`

### Radii

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 8px | inputs, chips |
| `radius-md` | 12px | cards |
| `radius-lg` | 16px | sheets, modals |
| `radius-pill` | 999px | duration selector, tags |

### Elevation (shadow)

| Token | Light | Dark |
|---|---|---|
| `shadow-1` | `0 1px 2px rgba(0,0,0,0.04)` | `0 1px 2px rgba(0,0,0,0.4)` |
| `shadow-2` | `0 4px 12px rgba(0,0,0,0.06)` | `0 4px 12px rgba(0,0,0,0.5)` |

### Motion

| Token | Value | Use |
|---|---|---|
| `duration-fast` | 150ms | tap feedback |
| `duration-base` | 250ms | screen/card transitions |
| `duration-slow` | 400ms | listening/thinking/speaking state morph |
| `easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` | all of the above |

```css
:root {
  --background: #FFFFFF;
  --surface: #F7F7F8;
  --surface-elevated: #FFFFFF;
  --border: #E5E5E8;
  --text-primary: #111113;
  --text-secondary: #5B5B63;
  --text-tertiary: #8E8E96;
  --accent: #6D5EF5;
  --accent-foreground: #FFFFFF;
  --success: #1E9E6B;
  --warning: #C77D14;
  --danger: #D6432F;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;
}
[data-theme="dark"] {
  --background: #0B0B0E;
  --surface: #151517;
  --surface-elevated: #1D1D20;
  --border: #2A2A2E;
  --text-primary: #F2F2F3;
  --text-secondary: #A6A6AD;
  --text-tertiary: #75757D;
  --accent: #8B7BFF;
  --accent-foreground: #0B0B0E;
  --success: #3ECF8E;
  --warning: #E8A33D;
  --danger: #F0665A;
}
```

---

## 7. Non-Functional Requirements Checklist

- [ ] Every async action: loading, success, error+retry states — no blank/dead screens.
- [ ] Session resilience: realtime channel drop → reconnect, resume from last confirmed turn (state in `interview_session_state`, never client memory).
- [ ] Fast startup, lazy-loaded routes, pagination on history/report lists.
- [ ] Accessibility: dynamic font sizes, screen reader labels, high-contrast mode, large tap targets (min 44x44).
- [ ] Light and dark mode on every screen.
- [ ] Business logic (question generation, scoring, pacing) lives only in edge functions — never in UI components.

---

## 8. Deviations from the Original Brief (with rationale)

| Brief said | This package uses instead | Why |
|---|---|---|
| React Native (Expo) mobile app | Mobile-first responsive web app (React + Tailwind + shadcn/ui) | Lovable builds React web apps, not React Native/Expo. A responsive PWA satisfies the mobile-first UI spec now; it can be wrapped with Capacitor later for app-store native builds without a rewrite. |
| NestJS, 3 independently deployable backend services | Supabase (Postgres + Auth + Edge Functions), kept as 3 separate function groups (`core-*`, `engine-*`, `reporting-*`) | Lovable's managed backend is Supabase. True independent-deploy scaling isn't available, but logical separation is preserved so the modules can be lifted into standalone services later if the Interview Engine's latency needs outgrow Supabase Edge Functions. |
| Redis for live session state | `interview_session_state` Postgres table | Removes an extra infra dependency for MVP scale; still centralized (not client memory), so any function invocation can resume a session. Revisit if concurrent-session volume demands sub-ms state access. |
| BullMQ / SQS for report generation | Direct async invocation of `reporting-generate` on session completion (upgradeable to `pgmq`/`pg_cron` if a real queue is needed) | Simpler for MVP; Supabase doesn't ship BullMQ/SQS natively. Swap in a queue extension if report volume needs backpressure. |
| Raw WebSocket for the live voice turn loop | Supabase Realtime Broadcast channel for transcript/turn-state events; actual low-latency audio streaming should go through a dedicated STT/TTS provider's own realtime API (e.g. ElevenLabs Conversational AI, OpenAI Realtime), proxied through an edge function | Supabase Realtime is well-suited to control-plane events but isn't built for continuous binary audio at voice-call latency. This is the one piece worth validating with a provider spike before full build-out. |
| Mobile OTP (SMS) | Supported via Supabase Auth, but requires configuring an SMS provider (e.g. Twilio) in the Supabase project | Not a code change, just a setup dependency — flagging so it isn't missed at launch. |
| S3-compatible object storage | Supabase Storage, gated off by default | Same requirement, different bucket provider; brief already says only add this if audio retention is confirmed needed. |

---

## 9. First message to send Lovable

Paste this as the initial prompt (or `create_project` message) to start the build:

> Build a premium, mobile-first, voice-first AI interview coaching web app called "Interview Coach". Use Supabase for auth (email OTP, no passwords), Postgres, edge functions, and realtime. Design language: minimalist, rounded cards, generous spacing, large touch targets, smooth transitions — inspired by ChatGPT, Linear, Notion, and ElevenLabs. Support light and dark mode as first-class from the start, using this token set: [paste Section 6 tokens]. Bottom tab nav with 4 tabs: Home, Interviews, Reports, Profile. Home: paste a job description into a large text area, pick an interview duration (15/30/45/60 min as 4 large tappable options), one primary "Start Interview" button disabled until both are set — no other setup fields. Interview screen: full-screen, an animated central state indicator for listening/thinking/speaking, auto-scrolling live transcript, a push-to-talk toggle alongside continuous listening, a subtle elapsed/remaining time indicator, and a graceful reconnect state if the connection drops — never a blank screen, never show scores or hints mid-interview. Report screen: overall score and communication score prominent at top, expandable per-question cards (question, answer summary, score, suggested stronger answer), a top-5-improvements list, and a collapsed-by-default full transcript. Interviews screen: searchable, sortable history list of past sessions with role, date, duration, and score. Profile: account/session management and settings for theme, push-to-talk default, and font size. All question generation, follow-up logic, and scoring must happen in Supabase edge functions — never hardcode questions or scores in the frontend. Use the data model and edge-function contract in LOVABLE_HANDOFF.md in this repo as the source of truth.

---

*Package generated as the Part C deliverable of the AI Interview Coach Build Brief.*
