import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { StudioApp } from "@/components/studio/studio-app";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { touchLastSeen } from "@/lib/profiles";

export const Route = createFileRoute("/app")({
  component: AppGate,
  head: () => ({
    meta: [{ title: "Studio — LIPRO" }],
  }),
});

function AppGate() {
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    if (!user) return;
    void touchLastSeen().catch(() => undefined);
  }, [user]);

  if (isPending) return <div className="min-h-dvh bg-bg" />;
  if (!user) return <RedirectToSignIn />;
  return <StudioApp />;
}
