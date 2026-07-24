export type OrbState = "idle" | "listening" | "thinking" | "speaking";

const CONFIG: Record<OrbState, { label: string; anim: string; color: string }> = {
  idle: { label: "Ready", anim: "orb-idle 3s var(--ease-standard) infinite", color: "var(--text-tertiary)" },
  listening: { label: "Listening", anim: "orb-listen 1.2s var(--ease-standard) infinite", color: "var(--success)" },
  thinking: { label: "Thinking", anim: "orb-think 1.6s var(--ease-standard) infinite", color: "var(--warning)" },
  speaking: { label: "Speaking", anim: "orb-speak 1.1s var(--ease-standard) infinite", color: "var(--accent)" },
};

export function StateOrb({ state }: { state: OrbState }) {
  const c = CONFIG[state];
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-40 w-40" style={{ transition: "all var(--duration-slow) var(--ease-standard)" }}>
        <div
          className="absolute inset-0 rounded-full blur-2xl opacity-40"
          style={{ background: c.color, animation: c.anim }}
        />
        <div
          className="absolute inset-4 rounded-full"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${c.color}, transparent 70%), var(--surface-elevated)`,
            border: `1px solid ${c.color}`,
            animation: c.anim,
          }}
        />
      </div>
      <p className="text-h3" style={{ color: c.color }}>{c.label}</p>
    </div>
  );
}
