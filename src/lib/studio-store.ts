import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ExamAttempt,
  ExamPaper,
  ExamQuestion,
  QuestionKind,
  SitMode,
} from "@/lib/exam-types";
import { rebalancePaperKeys } from "@/lib/exam-types";
import type { FlashCard, FlashDeck } from "@/lib/flash-types";

export type Role = "user" | "assistant";
export type StudioMode = "lipro" | "muse" | "scholar" | "maker" | "confidant";
export type StudioView = "chat" | "imagine" | "exam" | "cards";
export type AspectRatio = "1:1" | "16:9" | "9:16" | "3:2";

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
};

export type Conversation = {
  id: string;
  title: string;
  mode: StudioMode;
  messages: ChatMessage[];
  updatedAt: number;
};

export type GeneratedImage = {
  id: string;
  prompt: string;
  url: string;
  aspectRatio: AspectRatio;
  createdAt: number;
};

type StudioState = {
  conversations: Conversation[];
  activeId: string | null;
  images: GeneratedImage[];
  exams: ExamPaper[];
  activeExamId: string | null;
  decks: FlashDeck[];
  activeDeckId: string | null;
  mode: StudioMode;
  view: StudioView;
  aspectRatio: AspectRatio;
  setView: (view: StudioView) => void;
  setMode: (mode: StudioMode) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  newConversation: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  appendMessage: (conversationId: string, message: ChatMessage) => void;
  updateMessage: (conversationId: string, messageId: string, content: string) => void;
  addImage: (image: GeneratedImage) => void;
  removeImage: (id: string) => void;
  saveExam: (paper: ExamPaper) => void;
  selectExam: (id: string | null) => void;
  deleteExam: (id: string) => void;
  setExamAnswer: (examId: string, questionId: string, value: string | number) => void;
  toggleExamFlag: (examId: string, questionId: string) => void;
  submitExam: (examId: string) => void;
  resetExamAttempt: (examId: string, mode?: SitMode, durationMs?: number) => void;
  revealExamQuestion: (examId: string, questionId: string) => void;
  saveDeck: (deck: FlashDeck) => void;
  selectDeck: (id: string | null) => void;
  deleteDeck: (id: string) => void;
  rateCard: (deckId: string, cardId: string, knew: boolean) => void;
  resetDeck: (deckId: string) => void;
};

function uid() {
  return crypto.randomUUID();
}

export const MODES: {
  id: StudioMode;
  label: string;
  hint: string;
}[] = [
  { id: "lipro", label: "LIPRO", hint: "Clear, direct, useful" },
  { id: "muse", label: "Muse", hint: "Language, story, image" },
  { id: "scholar", label: "Scholar", hint: "Teach it until it sticks" },
  { id: "maker", label: "Maker", hint: "Build, code, ship" },
  { id: "confidant", label: "Confidant", hint: "Think it through with you" },
];

export const STARTERS: Record<StudioMode, string[]> = {
  lipro: [
    "Help me think through a hard decision",
    "Give this idea a sharper name and a one-line pitch",
    "What am I missing in this plan?",
  ],
  muse: [
    "Draft a scene that starts in complete silence",
    "Write a 60-second script with a turn at the end",
    "Give me five unexpected metaphors for grit",
  ],
  scholar: [
    "Explain this like I am a first-year student, then raise it",
    "Quiz me on a topic and tell me what I got wrong",
    "Build a one-week revision plan from a messy outline",
  ],
  maker: [
    "Turn this product idea into a weekend build plan",
    "Review this approach and name the real risks",
    "Write a clean function and explain the tradeoffs",
  ],
  confidant: [
    "I am stuck. Ask me better questions than I am asking myself",
    "Help me say this more honestly, with less heat",
    "What would a calmer version of me do next?",
  ],
};

export const IMAGE_STARTERS = [
  "A quiet library at dusk, one lamp, rain on tall windows",
  "Editorial portrait in motion, film grain, still air",
  "A geometric city folded from paper and pale light",
];

function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New thread";
  return clean.length > 42 ? `${clean.slice(0, 42).trimEnd()}…` : clean;
}

function ensureAttempt(paper: ExamPaper): ExamAttempt {
  const a = paper.attempt;
  return {
    answers: a?.answers ?? {},
    flagged: a?.flagged ?? [],
    revealed: a?.revealed ?? [],
    mode: a?.mode ?? "exam",
    durationMs: a?.durationMs,
    startedAt: a?.startedAt ?? Date.now(),
    submittedAt: a?.submittedAt,
  };
}

export const useStudioStore = create<StudioState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,
      images: [],
      exams: [],
      activeExamId: null,
      decks: [],
      activeDeckId: null,
      mode: "lipro",
      view: "chat",
      aspectRatio: "1:1",
      setView: (view) => set({ view }),
      setMode: (mode) => {
        const { activeId, conversations } = get();
        set({
          mode,
          conversations: conversations.map((c) =>
            c.id === activeId ? { ...c, mode, updatedAt: Date.now() } : c,
          ),
        });
      },
      setAspectRatio: (aspectRatio) => set({ aspectRatio }),
      newConversation: () => {
        const id = uid();
        const mode = get().mode;
        const conversation: Conversation = {
          id,
          title: "New thread",
          mode,
          messages: [],
          updatedAt: Date.now(),
        };
        set({
          conversations: [conversation, ...get().conversations],
          activeId: id,
          view: "chat",
        });
        return id;
      },
      selectConversation: (id) => {
        const found = get().conversations.find((c) => c.id === id);
        if (!found) return;
        set({ activeId: id, mode: found.mode, view: "chat" });
      },
      deleteConversation: (id) => {
        const next = get().conversations.filter((c) => c.id !== id);
        const activeId = get().activeId === id ? (next[0]?.id ?? null) : get().activeId;
        set({
          conversations: next,
          activeId,
          mode: next.find((c) => c.id === activeId)?.mode ?? get().mode,
        });
      },
      appendMessage: (conversationId, message) => {
        set({
          conversations: get().conversations.map((c) => {
            if (c.id !== conversationId) return c;
            const title =
              c.messages.length === 0 && message.role === "user"
                ? titleFrom(message.content)
                : c.title;
            return {
              ...c,
              title,
              messages: [...c.messages, message],
              updatedAt: Date.now(),
            };
          }),
        });
      },
      updateMessage: (conversationId, messageId, content) => {
        set({
          conversations: get().conversations.map((c) =>
            c.id !== conversationId
              ? c
              : {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, content } : m,
                  ),
                  updatedAt: Date.now(),
                },
          ),
        });
      },
      addImage: (image) => set({ images: [image, ...get().images].slice(0, 24) }),
      removeImage: (id) => set({ images: get().images.filter((img) => img.id !== id) }),
      saveExam: (paper) => {
        const next = rebalancePaperKeys(paper);
        set({
          exams: [next, ...get().exams.filter((e) => e.id !== next.id)].slice(0, 8),
          activeExamId: next.id,
          view: "exam",
        });
      },
      selectExam: (id) => {
        if (!id) {
          set({ activeExamId: null, view: "exam" });
          return;
        }
        set({
          exams: get().exams.map((paper) =>
            paper.id === id ? rebalancePaperKeys(paper) : paper,
          ),
          activeExamId: id,
          view: "exam",
        });
      },
      deleteExam: (id) => {
        const next = get().exams.filter((e) => e.id !== id);
        const activeExamId = get().activeExamId === id ? (next[0]?.id ?? null) : get().activeExamId;
        set({ exams: next, activeExamId });
      },
      setExamAnswer: (examId, questionId, value) => {
        set({
          exams: get().exams.map((paper) => {
            if (paper.id !== examId || paper.attempt?.submittedAt) return paper;
            const attempt = ensureAttempt(paper);
            if (attempt.revealed.includes(questionId)) return paper;
            return {
              ...paper,
              attempt: {
                ...attempt,
                answers: { ...attempt.answers, [questionId]: value },
              },
            };
          }),
        });
      },
      toggleExamFlag: (examId, questionId) => {
        set({
          exams: get().exams.map((paper) => {
            if (paper.id !== examId || paper.attempt?.submittedAt) return paper;
            const attempt = ensureAttempt(paper);
            const flagged = attempt.flagged.includes(questionId)
              ? attempt.flagged.filter((id) => id !== questionId)
              : [...attempt.flagged, questionId];
            return { ...paper, attempt: { ...attempt, flagged } };
          }),
        });
      },
      submitExam: (examId) => {
        set({
          exams: get().exams.map((paper) => {
            if (paper.id !== examId) return paper;
            const attempt = ensureAttempt(paper);
            return {
              ...paper,
              attempt: { ...attempt, submittedAt: Date.now() },
            };
          }),
        });
      },
      resetExamAttempt: (examId, mode, durationMs) => {
        set({
          exams: get().exams.map((paper) =>
            paper.id === examId
              ? {
                  ...paper,
                  attempt: {
                    answers: {},
                    flagged: [],
                    revealed: [],
                    mode: mode ?? paper.attempt?.mode ?? "exam",
                    durationMs:
                      (mode ?? paper.attempt?.mode ?? "exam") === "exam"
                        ? (durationMs ?? paper.attempt?.durationMs)
                        : undefined,
                    startedAt: Date.now(),
                  },
                }
              : paper,
          ),
        });
      },
      revealExamQuestion: (examId, questionId) => {
        set({
          exams: get().exams.map((paper) => {
            if (paper.id !== examId || paper.attempt?.submittedAt) return paper;
            const attempt = ensureAttempt(paper);
            if (attempt.revealed.includes(questionId)) return paper;
            return {
              ...paper,
              attempt: { ...attempt, revealed: [...attempt.revealed, questionId] },
            };
          }),
        });
      },
      saveDeck: (deck) =>
        set({
          decks: [deck, ...get().decks.filter((d) => d.id !== deck.id)].slice(0, 8),
          activeDeckId: deck.id,
          view: "cards",
        }),
      selectDeck: (id) => set({ activeDeckId: id, view: "cards" }),
      deleteDeck: (id) => {
        const next = get().decks.filter((d) => d.id !== id);
        const activeDeckId = get().activeDeckId === id ? (next[0]?.id ?? null) : get().activeDeckId;
        set({ decks: next, activeDeckId });
      },
      rateCard: (deckId, cardId, knew) => {
        set({
          decks: get().decks.map((deck) => {
            if (deck.id !== deckId) return deck;
            return {
              ...deck,
              cards: deck.cards.map((card) => {
                if (card.id !== cardId) return card;
                const box: FlashCard["box"] = knew
                  ? ((Math.min(3, card.box + 1) as FlashCard["box"]))
                  : 1;
                return { ...card, box };
              }),
            };
          }),
        });
      },
      resetDeck: (deckId) => {
        set({
          decks: get().decks.map((deck) =>
            deck.id === deckId
              ? { ...deck, cards: deck.cards.map((card) => ({ ...card, box: 1 as const })) }
              : deck,
          ),
        });
      },
    }),
    {
      name: "lipro-studio-v1",
      partialize: (state) => ({
        conversations: state.conversations,
        activeId: state.activeId,
        images: state.images,
        exams: state.exams,
        activeExamId: state.activeExamId,
        decks: state.decks,
        activeDeckId: state.activeDeckId,
        mode: state.mode,
        view: state.view,
        aspectRatio: state.aspectRatio,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StudioState>;
        return {
          ...current,
          ...p,
          exams: (p.exams ?? current.exams).map(rebalancePaperKeys),
          decks: p.decks ?? current.decks,
          images: p.images ?? current.images,
          conversations: p.conversations ?? current.conversations,
        };
      },
    },
  ),
);

export function useActiveConversation() {
  return useStudioStore((s) => s.conversations.find((c) => c.id === s.activeId) ?? null);
}

export function useActiveExam() {
  return useStudioStore((s) => s.exams.find((e) => e.id === s.activeExamId) ?? null);
}

export function useActiveDeck() {
  return useStudioStore((s) => s.decks.find((d) => d.id === s.activeDeckId) ?? null);
}

export type { ExamPaper, ExamQuestion, ExamAttempt, QuestionKind, SitMode, FlashDeck, FlashCard };
