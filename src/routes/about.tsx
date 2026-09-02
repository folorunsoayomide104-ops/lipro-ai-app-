import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/components/site/about-page";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: [{ title: "About — LIPRO" }],
  }),
});
