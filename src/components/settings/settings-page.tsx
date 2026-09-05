import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { clearNvidiaKey, getNvidiaKeyStatus, saveNvidiaKey } from "@/lib/user-settings";

export function SettingsPage() {
  const { user, isPending } = useCurrentUserState();
  const [ready, setReady] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isPending || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const status = await getNvidiaKeyStatus();
        if (cancelled) return;
        setMasked(status.masked);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load settings.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPending, user]);

  async function handleSave() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const result = await saveNvidiaKey({ data: { apiKey: draft.trim() } });
      setMasked(result.masked);
      setDraft("");
      setNotice("Key saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the key.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setError(null);
    setNotice(null);
    setClearing(true);
    try {
      await clearNvidiaKey();
      setMasked(null);
      setNotice("Key removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the key.");
    } finally {
      setClearing(false);
    }
  }

  if (isPending) {
    return <div className="min-h-dvh bg-bg" />;
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-4 px-5 md:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <Mark className="size-6 text-primary" />
            <span className="font-display text-xl tracking-tight">LIPRO</span>
          </Link>
          <p className="hidden text-sm text-subtle sm:block">Settings</p>
          <div className="ml-auto flex items-center gap-4">
            <Link to="/app" className="text-sm text-muted hover:text-fg">
              Studio
            </Link>
            <UserButton />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 py-10 md:px-8">
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">Settings.</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Bring your own NVIDIA API key. It's stored on your account, never in this
          browser, and only you can read or replace it.
        </p>

        <div className="mt-8 rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6">
          <p className="text-sm font-medium text-fg">NVIDIA API key</p>
          <p className="mt-1 text-xs text-subtle">
            From{" "}
            <a
              href="https://build.nvidia.com"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-fg"
            >
              build.nvidia.com
            </a>
          </p>

          {!ready ? null : (
            <div className="mt-4 space-y-3">
              {masked ? (
                <p className="text-sm text-muted">
                  Current key: <span className="font-mono text-fg">{masked}</span>
                </p>
              ) : (
                <p className="text-sm text-subtle">No key saved yet.</p>
              )}

              <input
                type="password"
                autoComplete="off"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="nvapi-…"
                className="h-11 w-full rounded-md bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none placeholder:text-subtle"
              />

              {error ? <p className="text-sm text-danger">{error}</p> : null}
              {notice ? <p className="text-sm text-muted">{notice}</p> : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={saving || draft.trim().length < 20}
                  onClick={() => void handleSave()}
                >
                  {saving ? "Saving…" : "Save key"}
                </Button>
                {masked ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={clearing}
                    onClick={() => void handleClear()}
                  >
                    {clearing ? "Removing…" : "Remove key"}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
