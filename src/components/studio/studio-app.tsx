import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Drawer } from "vaul";
import { toast, Toaster } from "sonner";
import {
  ArrowUp,
  ClipboardList,
  Copy,
  Layers,
  Menu,
  MessageSquarePlus,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import { speakText } from "@/lib/ai";
import {
  MODES,
  STARTERS,
  useActiveConversation,
  useActiveDeck,
  useActiveExam,
  useStudioStore,
  type ChatMessage,
  type Conversation,
  type ExamPaper,
  type FlashDeck,
  type StudioMode,
} from "@/lib/studio-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { MessageContent } from "@/components/studio/message-content";
import { ImagineView } from "@/components/studio/imagine-view";
import { CbtView } from "@/components/studio/cbt-view";
import { FlashView } from "@/components/studio/flash-view";
import { Mark } from "@/components/brand";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";

function useHasHydrated() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

function formatTime(ts: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(ts);
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Could not copy");
  }
}

function ThreadList({
  conversations,
  activeId,
  onSelect,
  onDelete,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (conversations.length === 0) {
    return <p className="px-3 py-6 text-sm text-subtle">No threads yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-1 p-2">
      {conversations.map((c) => (
        <li key={c.id}>
          <div
            className={cn(
              "group flex items-center gap-1 rounded-md pr-1",
              c.id === activeId ? "bg-elevated" : "hover:bg-elevated/70",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className="min-w-0 flex-1 px-3 py-2.5 text-left"
            >
              <span className="block truncate text-sm text-fg">{c.title}</span>
              <span className="mt-0.5 block text-xs text-subtle">{formatTime(c.updatedAt)}</span>
            </button>
            <button
              type="button"
              aria-label="Delete thread"
              onClick={() => onDelete(c.id)}
              className="size-9 shrink-0 rounded-sm text-subtle opacity-100 transition-colors hover:text-fg md:opacity-0 md:group-hover:opacity-100"
            >
              <Trash2 className="mx-auto size-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ExamList({
  exams,
  activeId,
  onSelect,
  onDelete,
}: {
  exams: ExamPaper[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (exams.length === 0) {
    return <p className="px-3 py-6 text-sm text-subtle">No papers yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-1 p-2">
      {exams.map((paper) => (
        <li key={paper.id}>
          <div
            className={cn(
              "group flex items-center gap-1 rounded-md pr-1",
              paper.id === activeId ? "bg-elevated" : "hover:bg-elevated/70",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(paper.id)}
              className="min-w-0 flex-1 px-3 py-2.5 text-left"
            >
              <span className="block truncate text-sm text-fg">{paper.title}</span>
              <span className="mt-0.5 block text-xs text-subtle">
                {paper.questions.length} questions · {formatTime(paper.createdAt)}
              </span>
            </button>
            <button
              type="button"
              aria-label="Delete paper"
              onClick={() => onDelete(paper.id)}
              className="size-9 shrink-0 rounded-sm text-subtle opacity-100 transition-colors hover:text-fg md:opacity-0 md:group-hover:opacity-100"
            >
              <Trash2 className="mx-auto size-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeckList({
  decks,
  activeId,
  onSelect,
  onDelete,
}: {
  decks: FlashDeck[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (decks.length === 0) {
    return <p className="px-3 py-6 text-sm text-subtle">No decks yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-1 p-2">
      {decks.map((deck) => (
        <li key={deck.id}>
          <div
            className={cn(
              "group flex items-center gap-1 rounded-md pr-1",
              deck.id === activeId ? "bg-elevated" : "hover:bg-elevated/70",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(deck.id)}
              className="min-w-0 flex-1 px-3 py-2.5 text-left"
            >
              <span className="block truncate text-sm text-fg">{deck.title}</span>
              <span className="mt-0.5 block text-xs text-subtle">
                {deck.cards.length} cards · {formatTime(deck.createdAt)}
              </span>
            </button>
            <button
              type="button"
              aria-label="Delete deck"
              onClick={() => onDelete(deck.id)}
              className="size-9 shrink-0 rounded-sm text-subtle opacity-100 transition-colors hover:text-fg md:opacity-0 md:group-hover:opacity-100"
            >
              <Trash2 className="mx-auto size-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const conversations = useStudioStore((s) => s.conversations);
  const activeId = useStudioStore((s) => s.activeId);
  const selectConversation = useStudioStore((s) => s.selectConversation);
  const deleteConversation = useStudioStore((s) => s.deleteConversation);
  const newConversation = useStudioStore((s) => s.newConversation);
  const exams = useStudioStore((s) => s.exams);
  const activeExamId = useStudioStore((s) => s.activeExamId);
  const selectExam = useStudioStore((s) => s.selectExam);
  const deleteExam = useStudioStore((s) => s.deleteExam);
  const decks = useStudioStore((s) => s.decks);
  const activeDeckId = useStudioStore((s) => s.activeDeckId);
  const selectDeck = useStudioStore((s) => s.selectDeck);
  const deleteDeck = useStudioStore((s) => s.deleteDeck);
  const view = useStudioStore((s) => s.view);
  const setView = useStudioStore((s) => s.setView);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-5">
        <Link to="/" className="flex items-center gap-2.5 text-fg">
          <Mark className="size-6 text-primary" />
          <div>
            <p className="font-display text-xl leading-none tracking-tight">LIPRO</p>
            <p className="mt-1 text-xs text-subtle">Life in progress</p>
          </div>
        </Link>
      </div>
      <div className="px-3 pb-3">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-elevated p-1 shadow-[var(--shadow-border)]">
          {(
            [
              ["chat", "Chat"],
              ["exam", "Exam"],
              ["cards", "Cards"],
              ["imagine", "Imagine"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setView(id);
                onNavigate?.();
              }}
              className={cn(
                "h-9 rounded-sm text-sm font-medium transition-colors duration-150",
                view === id ? "bg-primary text-primary-fg" : "text-muted hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-3 pb-3">
        {view === "exam" ? (
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={() => {
              selectExam(null);
              onNavigate?.();
            }}
          >
            <ClipboardList className="size-4" />
            New paper
          </Button>
        ) : view === "cards" ? (
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={() => {
              selectDeck(null);
              onNavigate?.();
            }}
          >
            <Layers className="size-4" />
            New deck
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={() => {
              newConversation();
              setView("chat");
              onNavigate?.();
            }}
          >
            <MessageSquarePlus className="size-4" />
            New thread
          </Button>
        )}
      </div>
      <Separator />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "exam" ? (
          <>
            <p className="px-4 pb-1 pt-4 text-xs font-medium uppercase tracking-[0.16em] text-subtle">
              Papers
            </p>
            <ExamList
              exams={exams}
              activeId={activeExamId}
              onSelect={(id) => {
                selectExam(id);
                onNavigate?.();
              }}
              onDelete={deleteExam}
            />
          </>
        ) : view === "cards" ? (
          <>
            <p className="px-4 pb-1 pt-4 text-xs font-medium uppercase tracking-[0.16em] text-subtle">
              Decks
            </p>
            <DeckList
              decks={decks}
              activeId={activeDeckId}
              onSelect={(id) => {
                selectDeck(id);
                onNavigate?.();
              }}
              onDelete={deleteDeck}
            />
          </>
        ) : (
          <>
            <p className="px-4 pb-1 pt-4 text-xs font-medium uppercase tracking-[0.16em] text-subtle">
              Threads
            </p>
            <ThreadList
              conversations={conversations}
              activeId={activeId}
              onSelect={(id) => {
                selectConversation(id);
                onNavigate?.();
              }}
              onDelete={deleteConversation}
            />
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  mode,
  onPick,
}: {
  mode: StudioMode;
  onPick: (text: string) => void;
}) {
  const starters = STARTERS[mode];
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10 md:px-0">
      <Mark className="size-10 text-primary aether-rise" />
      <h1 className="mt-6 font-display text-5xl tracking-tight text-fg aether-rise aether-rise-delay-1 md:text-6xl">
        LIPRO
      </h1>
      <p className="mt-3 max-w-sm text-base leading-normal text-muted aether-rise aether-rise-delay-2">
        Life in progress. A private studio for thinking.
      </p>
      <div className="mt-8 flex flex-col gap-2 aether-rise aether-rise-delay-3">
        {starters.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => onPick(starter)}
            className="rounded-lg bg-surface px-4 py-3 text-left text-sm leading-normal text-muted shadow-[var(--shadow-border)] transition-[color,box-shadow] duration-150 hover:text-fg hover:shadow-[var(--shadow-border-hover)]"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({
  message,
  streaming,
  onSpeak,
  speaking,
}: {
  message: ChatMessage;
  streaming?: boolean;
  onSpeak: (text: string) => void;
  speaking?: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <article className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[min(40rem,100%)]", isUser ? "" : "w-full")}>
        {isUser ? (
          <div className="rounded-xl rounded-br-sm bg-elevated px-4 py-3 text-sm leading-normal text-fg shadow-[var(--shadow-border)]">
            {message.content}
          </div>
        ) : (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-subtle">LIPRO</p>
            <MessageContent text={message.content} streaming={streaming} />
            {!streaming && message.content ? (
              <div className="mt-3 flex gap-1">
                <Tooltip label="Copy">
                  <button
                    type="button"
                    aria-label="Copy reply"
                    onClick={() => void copyText(message.content)}
                    className="size-9 rounded-sm text-subtle transition-colors hover:bg-elevated hover:text-fg"
                  >
                    <Copy className="mx-auto size-4" />
                  </button>
                </Tooltip>
                <Tooltip label={speaking ? "Speaking" : "Listen"}>
                  <button
                    type="button"
                    aria-label="Listen to reply"
                    onClick={() => onSpeak(message.content)}
                    className="size-9 rounded-sm text-subtle transition-colors hover:bg-elevated hover:text-fg"
                  >
                    <Volume2 className={cn("mx-auto size-4", speaking && "text-primary")} />
                  </button>
                </Tooltip>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}

export function StudioApp() {
  const hydrated = useHasHydrated();
  const view = useStudioStore((s) => s.view);
  const mode = useStudioStore((s) => s.mode);
  const setMode = useStudioStore((s) => s.setMode);
  const active = useActiveConversation();
  const activeExam = useActiveExam();
  const activeDeck = useActiveDeck();
  const activeId = useStudioStore((s) => s.activeId);
  const newConversation = useStudioStore((s) => s.newConversation);
  const appendMessage = useStudioStore((s) => s.appendMessage);
  const updateMessage = useStudioStore((s) => s.updateMessage);
  const [draft, setDraft] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const messages = active?.messages ?? [];
  const busy = Boolean(streamingId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingId, view]);

  const modeMeta = useMemo(() => MODES.find((m) => m.id === mode) ?? MODES[0], [mode]);

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamingId(null);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setDraft("");

    let conversationId = activeId;
    if (!conversationId) conversationId = newConversation();

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };
    appendMessage(conversationId, userMsg);
    appendMessage(conversationId, assistantMsg);
    setStreamingId(assistantMsg.id);

    const history = useStudioStore
      .getState()
      .conversations.find((c) => c.id === conversationId)
      ?.messages.filter((m) => m.id !== assistantMsg.id)
      .map((m) => ({ role: m.role, content: m.content })) ?? [
      { role: "user" as const, content: trimmed },
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ messages: history, mode }),
      });

      if (!res.ok) {
        let err = "LIPRO could not reply.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) err = body.error;
        } catch {
          // keep default
        }
        updateMessage(conversationId, assistantMsg.id, err);
        toast.error(err);
        return;
      }

      if (!res.body) {
        updateMessage(conversationId, assistantMsg.id, "Empty reply.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        updateMessage(conversationId, assistantMsg.id, acc);
      }
      if (!acc.trim()) {
        updateMessage(conversationId, assistantMsg.id, "No reply came through. Try again.");
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        const current = useStudioStore
          .getState()
          .conversations.find((c) => c.id === conversationId)
          ?.messages.find((m) => m.id === assistantMsg.id)?.content;
        if (!current) {
          updateMessage(conversationId, assistantMsg.id, "Stopped.");
        }
        return;
      }
      toast.error("The connection dropped.");
      updateMessage(conversationId, assistantMsg.id, "The connection dropped. Try again.");
    } finally {
      abortRef.current = null;
      setStreamingId(null);
    }
  }

  async function onSpeak(message: ChatMessage) {
    if (speakingId === message.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setSpeakingId(null);
      return;
    }
    audioRef.current?.pause();
    setSpeakingId(message.id);
    try {
      const result = await speakText({ data: { text: message.content.slice(0, 800) } });
      if (!result.ok) {
        toast.error(result.error);
        setSpeakingId(null);
        return;
      }
      const src = `data:${result.mime};base64,${result.audio}`;
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeakingId(null);
        audioRef.current = null;
      };
      await audio.play();
    } catch {
      toast.error("Could not play audio.");
      setSpeakingId(null);
    }
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  }

  return (
    <TooltipProvider>
      <div className="flex h-dvh min-h-0 bg-bg text-fg">
        <aside className="hidden w-72 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
          <SidebarBody />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 md:h-16 md:px-6">
            <Drawer.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Drawer.Trigger asChild>
                <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </Drawer.Trigger>
              <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 z-40 bg-bg/70" />
                <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 h-[86dvh] rounded-t-xl bg-surface shadow-[var(--shadow-float)] outline-none">
                  <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-border-strong" />
                  <SidebarBody onNavigate={() => setMenuOpen(false)} />
                </Drawer.Content>
              </Drawer.Portal>
            </Drawer.Root>

            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <Mark className="size-5 text-primary" />
              <span className="font-display text-lg tracking-tight">LIPRO</span>
            </div>

            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-medium text-fg">
                {view === "imagine"
                  ? "Imagine"
                  : view === "exam"
                    ? (activeExam?.title ?? "Exam")
                    : view === "cards"
                      ? (activeDeck?.title ?? "Flashcards")
                      : (active?.title ?? "New thread")}
              </p>
              <p className="text-xs text-subtle">
                {view === "exam"
                  ? activeExam?.attempt?.mode === "practice"
                    ? "Practice · check as you go"
                    : "Timed exam"
                  : view === "cards"
                    ? "Flip. Recall. Repeat."
                    : modeMeta.hint}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="hidden items-center gap-1 md:flex">
                {view === "chat"
                  ? MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMode(m.id)}
                        className={cn(
                          "h-9 shrink-0 rounded-full px-3 text-xs font-medium transition-colors duration-150",
                          mode === m.id
                            ? "bg-primary text-primary-fg"
                            : "text-muted hover:bg-elevated hover:text-fg",
                        )}
                      >
                        {m.label}
                      </button>
                    ))
                  : null}
              </div>
              <Link
                to="/admin"
                className="hidden h-9 items-center rounded-full px-3 text-xs text-muted hover:text-fg sm:inline-flex"
              >
                Admin
              </Link>
              <Link
                to="/settings"
                className="hidden h-9 items-center rounded-full px-3 text-xs text-muted hover:text-fg sm:inline-flex"
              >
                Settings
              </Link>
              <UserButton />
            </div>
          </header>

          <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
            {view === "imagine" ? (
              <ImagineView />
            ) : view === "exam" ? (
              <CbtView />
            ) : view === "cards" ? (
              <FlashView />
            ) : !hydrated || messages.length === 0 ? (
              <EmptyState mode={mode} onPick={(t) => void send(t)} />
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 md:px-8">
                {messages.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    streaming={streamingId === message.id}
                    speaking={speakingId === message.id}
                    onSpeak={() => void onSpeak(message)}
                  />
                ))}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {view === "chat" ? (
            <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 md:px-6">
              <div className="mx-auto mb-2 flex w-full max-w-3xl gap-1 overflow-x-auto md:hidden">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={cn(
                      "h-9 shrink-0 rounded-full px-3 text-xs font-medium transition-colors duration-150",
                      mode === m.id
                        ? "bg-primary text-primary-fg"
                        : "bg-surface text-muted shadow-[var(--shadow-border)] hover:text-fg",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <form
                className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-xl bg-surface p-2 shadow-[var(--shadow-border)]"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(draft);
                }}
              >
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onComposerKey}
                  placeholder={modeMeta.hint}
                  rows={1}
                  maxLength={4000}
                  disabled={busy}
                  className="max-h-40 min-h-11 flex-1 px-3 py-2.5"
                />
                {busy ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="Stop"
                    onClick={stop}
                  >
                    <Square className="size-4 fill-current" />
                  </Button>
                ) : (
                  <Button type="submit" size="icon" aria-label="Send" disabled={!draft.trim()}>
                    <ArrowUp className="size-4" />
                  </Button>
                )}
              </form>
              <p className="mx-auto mt-2 max-w-3xl px-1 text-center text-xs text-subtle">
                Enter to send · Shift+Enter for a new line
              </p>
            </div>
          ) : null}
        </div>
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            className: "!bg-elevated !text-fg !border-border !shadow-[var(--shadow-border)]",
          }}
        />
      </div>
    </TooltipProvider>
  );
}
