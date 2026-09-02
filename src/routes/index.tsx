import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/site/home-page";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "LIPRO — Life in progress" },
      {
        name: "description",
        content:
          "LIPRO is a private Grok studio for thinking, exam papers, flashcards, and images. Life in progress.",
      },
    ],
  }),
});
