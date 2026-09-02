import type { ExamPaper } from "@/lib/exam-types";

export type FlashCard = {
  id: string;
  front: string;
  back: string;
  box: 1 | 2 | 3;
};

export type FlashDeck = {
  id: string;
  title: string;
  sourceName: string;
  cards: FlashCard[];
  createdAt: number;
};

export const CARD_COUNTS = [10, 20, 40] as const;

export function cardsFromPaper(paper: ExamPaper): FlashCard[] {
  return paper.questions.map((q) => {
    let back = q.explanation;
    if (q.kind === "mcq") {
      const key = q.options?.[q.answerIndex ?? 0] ?? "";
      back = [key, q.explanation].filter(Boolean).join("\n\n");
    } else if (q.kind === "gap") {
      back = [(q.answers ?? []).join(", "), q.explanation].filter(Boolean).join("\n\n");
    } else {
      back = [q.modelAnswer, (q.markingPoints ?? []).join("\n"), q.explanation]
        .filter(Boolean)
        .join("\n\n");
    }
    return {
      id: crypto.randomUUID(),
      front: q.stem,
      back: back || "See the source notes.",
      box: 1,
    };
  });
}

export function dueCount(deck: FlashDeck) {
  return deck.cards.filter((c) => c.box === 1).length;
}
