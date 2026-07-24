import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Interview Coach" },
      { name: "description", content: "Sign in to Interview Coach with a magic link." },
      { property: "og:title", content: "Sign in — Interview Coach" },
      { property: "og:description", content: "Sign in to Interview Coach with a magic link." },
      { property: "og:url", content: "https://interview-aicoach.lovable.app/auth" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://interview-aicoach.lovable.app/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home" });
    });
  }, [navigate]);

  const sendMagicLink = async () => {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/home`,
      },
    });
    setLoading(false);
    if (error) return setError(error.message);
    setSent(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm animate-[fade-in_.3s_var(--ease-standard)]">
        <div className="mb-8 text-center">
          <div role="img" aria-label="Interview Coach logo" className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-accent" />
          <h1 className="text-h1">Interview Coach</h1>
          <p className="mt-2 text-body text-text-secondary">
            Practice interviews. Get scored feedback.
          </p>
        </div>

        {!sent ? (
          <div className="space-y-4">
            <label className="block">
              <span className="text-caption text-text-secondary">Email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-2 h-12 w-full rounded-sm border border-border bg-surface-elevated px-4 text-body outline-none focus:border-accent"
              />
            </label>
            <button
              disabled={!email.includes("@") || loading}
              onClick={sendMagicLink}
              className="btn-primary w-full"
            >
              {loading ? "Sending…" : "Send sign-in link"}
            </button>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-h2">
              📬
            </div>
            <h2 className="text-h2">Check your inbox</h2>
            <p className="text-body text-text-secondary">
              We've sent a link to <span className="text-text-primary">{email}</span>. Click it to
              sign in to your AI Interview Coach.
            </p>
            <button
              onClick={() => {
                setSent(false);
                setError(null);
              }}
              className="btn-ghost w-full text-body-sm text-text-secondary"
            >
              Use a different email
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
