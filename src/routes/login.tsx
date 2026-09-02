import { createFileRoute } from "@tanstack/react-router";
import { LoginTabs } from "@/components/auth/auth-forms";

export const Route = createFileRoute("/login")({
  component: LoginTabs,
  head: () => ({ meta: [{ title: "Sign in — LIPRO" }] }),
});
