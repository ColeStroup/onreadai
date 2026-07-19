"use client";

import {
  ArrowDown,
  ArrowUp,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  clearChatHistory,
  sendChatMessage,
  type ChatMode,
  type ChatMessageView,
} from "@/app/dashboard/businesses/[businessId]/chat/actions";
import { AssistantMarkdown } from "@/components/chat/assistant-markdown";
import { AutoResizeTextarea } from "@/components/chat/auto-resize-textarea";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ChatPanelProps = {
  businessId: string;
  initialMessages: ChatMessageView[];
  suggestedQuestions: string[];
  initialMode: ChatMode;
  initialDraft?: string;
  canSend: boolean;
  sendDisabledReason?: string;
};

type PendingExchange = {
  id: string;
  question: string;
  createdAt: string;
  state: "thinking" | "error";
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function MessageCard({ message }: { message: ChatMessageView }) {
  const isUser = message.role === "USER";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(760px,92%)] rounded-lg border px-4 py-3 shadow-sm",
          isUser
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background text-foreground",
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-4 text-xs opacity-75">
          <span>{isUser ? "You" : "Consultant"}</span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            {message.content}
          </p>
        ) : (
          <AssistantMarkdown content={message.content} />
        )}
      </div>
    </div>
  );
}

function ThinkingCard({ createdAt }: { createdAt: string }) {
  return (
    <div className="flex justify-start">
      <div
        role="status"
        aria-live="polite"
        className="max-w-[min(760px,92%)] rounded-lg border border-border bg-background px-4 py-3 text-foreground shadow-sm"
      >
        <div className="mb-2 flex items-center justify-between gap-4 text-xs text-muted">
          <span>Consultant</span>
          <span>{formatTime(createdAt)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>Thinking</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="size-1.5 animate-pulse rounded-full bg-current"
                style={{ animationDelay: `${dot * 160}ms` }}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

function FailedResponseCard({
  createdAt,
  disabled,
  onRetry,
}: {
  createdAt: string;
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex justify-start">
      <div
        role="alert"
        className="max-w-[min(760px,92%)] rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-950 shadow-sm dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100"
      >
        <div className="mb-2 flex items-center justify-between gap-4 text-xs opacity-75">
          <span>Consultant</span>
          <span>{formatTime(createdAt)}</span>
        </div>
        <p className="text-sm leading-6">
          The consultant could not respond. Try again.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={disabled}
          className={buttonVariants({
            variant: "secondary",
            size: "sm",
            className: "mt-3",
          })}
        >
          <RotateCcw className="size-4" />
          Retry
        </button>
      </div>
    </div>
  );
}

export function ChatPanel({
  businessId,
  initialMessages,
  suggestedQuestions,
  initialMode,
  initialDraft = "",
  canSend,
  sendDisabledReason,
}: ChatPanelProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [pendingExchange, setPendingExchange] =
    useState<PendingExchange | null>(null);
  const [input, setInput] = useState(initialDraft.slice(0, 2000));
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [mode, setMode] = useState<ChatMode>(initialMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, startClearingTransition] = useTransition();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [hasUnseenLatest, setHasUnseenLatest] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const requestInFlightRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const forceScrollToLatestRef = useRef(false);
  const didInitialScrollRef = useRef(false);
  const hasMessages = messages.length > 0 || Boolean(pendingExchange);
  const lastMessageId = messages.at(-1)?.id ?? "empty";

  function isDocumentNearBottom() {
    const documentElement = document.documentElement;
    const distanceFromBottom =
      documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    return distanceFromBottom < 180;
  }

  function scrollToLatest(behavior: ScrollBehavior = "smooth") {
    bottomAnchorRef.current?.scrollIntoView({
      behavior,
      block: "end",
    });
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
    setHasUnseenLatest(false);
  }

  useLayoutEffect(() => {
    const isInitialScroll = !didInitialScrollRef.current;
    const shouldScroll =
      isInitialScroll ||
      forceScrollToLatestRef.current ||
      isNearBottomRef.current;
    forceScrollToLatestRef.current = false;
    didInitialScrollRef.current = true;

    if (shouldScroll) {
      bottomAnchorRef.current?.scrollIntoView({
        behavior: isInitialScroll ? "auto" : "smooth",
        block: "end",
      });
      isNearBottomRef.current = true;
      const frame = window.requestAnimationFrame(() => {
        setShowJumpToLatest(false);
        setHasUnseenLatest(false);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    const frame = window.requestAnimationFrame(() => {
      setShowJumpToLatest(true);
      setHasUnseenLatest(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [lastMessageId, pendingExchange?.id, pendingExchange?.state]);

  useEffect(() => {
    let frame = 0;

    function updateNearBottomState() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const isNearBottom = isDocumentNearBottom();
        isNearBottomRef.current = isNearBottom;
        setShowJumpToLatest(hasMessages && !isNearBottom);
        if (isNearBottom) setHasUnseenLatest(false);
      });
    }

    updateNearBottomState();
    window.addEventListener("scroll", updateNearBottomState, { passive: true });
    window.addEventListener("resize", updateNearBottomState);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateNearBottomState);
      window.removeEventListener("resize", updateNearBottomState);
    };
  }, [hasMessages]);

  useEffect(() => {
    const composer = composerRef.current;
    const panel = chatPanelRef.current;
    if (!composer || !panel) return;
    const composerElement = composer;
    const panelElement = panel;

    let frame = 0;
    function syncComposerSpace() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const height = Math.ceil(
          composerElement.getBoundingClientRect().height,
        );
        panelElement.style.setProperty(
          "--chat-composer-height",
          `${height}px`,
        );
        if (isNearBottomRef.current) {
          bottomAnchorRef.current?.scrollIntoView({
            behavior: "auto",
            block: "end",
          });
        }
      });
    }

    const resizeObserver = new ResizeObserver(syncComposerSpace);
    resizeObserver.observe(composerElement);
    syncComposerSpace();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (initialDraft) {
      inputRef.current?.focus();
    }
  }, [initialDraft]);

  function restoreComposerFocus() {
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function requestResponse(
    question: string,
    exchangeId: string,
  ) {
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    setIsSubmitting(true);

    try {
      const result = await sendChatMessage({
        businessId,
        content: question,
      });

      if (result.error) {
        if (
          result.errorCode === "LIMIT_REACHED" ||
          result.errorCode === "VALIDATION" ||
          result.errorCode === "NO_AUDIT" ||
          result.errorCode === "CONTEXT_UNAVAILABLE" ||
          result.errorCode === "PROVIDER_UNAVAILABLE" ||
          result.errorCode === "PROVIDER_CONFIGURATION" ||
          result.errorCode === "RESPONSE_UNUSABLE" ||
          result.errorCode === "MESSAGE_PERSISTENCE" ||
          result.errorCode === "INTERNAL_ERROR"
        ) {
          setPendingExchange((current) =>
            current?.id === exchangeId ? null : current,
          );
          setInput((current) => (current.trim() ? current : question));
          setError(result.error);
        } else {
          setPendingExchange((current) =>
            current?.id === exchangeId
              ? { ...current, state: "error" }
              : current,
          );
        }
        return;
      }

      setMessages(result.messages);
      setPendingExchange((current) =>
        current?.id === exchangeId ? null : current,
      );
      setError("");
      if (result.mode) setMode(result.mode);

      const latestAssistant = [...result.messages]
        .reverse()
        .find((message) => message.role === "ASSISTANT");
      if (latestAssistant) {
        setAnnouncement(`Consultant replied: ${latestAssistant.content}`);
      }
    } catch {
      setPendingExchange((current) =>
        current?.id === exchangeId
          ? { ...current, state: "error" }
          : current,
      );
    } finally {
      requestInFlightRef.current = false;
      setIsSubmitting(false);
      restoreComposerFocus();
    }
  }

  function submitQuestion(question: string) {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || requestInFlightRef.current) return;

    if (!canSend) {
      setError(
        sendDisabledReason ??
          "Your current plan has reached its AI message limit.",
      );
      restoreComposerFocus();
      return;
    }

    const exchangeId = globalThis.crypto.randomUUID();
    const createdAt = new Date().toISOString();

    setError("");
    setAnnouncement("");
    setPendingExchange({
      id: exchangeId,
      question: trimmedQuestion,
      createdAt,
      state: "thinking",
    });
    setInput("");
    forceScrollToLatestRef.current = true;
    void requestResponse(trimmedQuestion, exchangeId);
  }

  function retryPendingExchange() {
    if (
      !pendingExchange ||
      pendingExchange.state !== "error" ||
      requestInFlightRef.current
    ) {
      return;
    }

    if (!canSend) {
      setError(
        sendDisabledReason ??
          "Your current plan has reached its AI message limit.",
      );
      return;
    }

    setError("");
    setPendingExchange({ ...pendingExchange, state: "thinking" });
    forceScrollToLatestRef.current = true;
    void requestResponse(pendingExchange.question, pendingExchange.id);
  }

  function confirmClearChat() {
    setError("");

    startClearingTransition(async () => {
      const result = await clearChatHistory({ businessId });

      if (result.error) {
        setError(result.error);
        return;
      }

      setMessages(result.messages);
      setPendingExchange(null);
      setMode(result.mode);
      setIsConfirmOpen(false);
      setAnnouncement("Chat history cleared.");
      isNearBottomRef.current = true;
      setShowJumpToLatest(false);
      setHasUnseenLatest(false);
      restoreComposerFocus();
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitQuestion(input);
  }

  return (
    <Card className="relative overflow-visible">
      <div ref={chatPanelRef}>
      <CardContent className="p-0">
        <div className="shrink-0 border-b border-border px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <MessageSquareText className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">AI Consultant</h2>
                <p className="text-sm text-muted">
                  Answers from your audit, goals, action plan, and progress.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold",
                  mode === "ai"
                    ? "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100"
                    : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
                )}
              >
                {mode === "ai" ? "Powered by AI" : "Temporarily unavailable"}
              </span>
              <button
                type="button"
                onClick={() => setIsConfirmOpen(true)}
                disabled={!hasMessages || isSubmitting || isClearing}
                className={buttonVariants({
                  variant: "secondary",
                  size: "sm",
                  className: "disabled:pointer-events-none disabled:opacity-45",
                })}
              >
                <Trash2 className="size-4" />
                Clear Chat
              </button>
            </div>
          </div>
        </div>

        <div
          id="chat-conversation"
          role="log"
          aria-label="AI Consultant conversation"
          className="px-4 py-5 sm:px-5"
        >
          {!hasMessages ? (
            <div className="mx-auto flex min-h-[380px] max-w-3xl flex-col items-center justify-center py-8 text-center">
              <span className="mb-4 flex size-14 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Sparkles className="size-6" />
              </span>
              <h2 className="text-2xl font-semibold">
                Ask your AI Consultant
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
                Ask about your audit, website, social media, recommendations,
                competitors, or what to fix next.
              </p>
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {suggestedQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => submitQuestion(question)}
                    disabled={isSubmitting || !canSend}
                    className="rounded-lg border border-border bg-background p-4 text-left text-sm font-medium transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Sparkles className="mb-3 size-4 text-accent" />
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-5">
              <div className="flex flex-wrap gap-2 pb-2">
                {suggestedQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => submitQuestion(question)}
                    disabled={isSubmitting || !canSend}
                    className="rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {question}
                  </button>
                ))}
              </div>

              {messages.map((message) => (
                <MessageCard key={message.id} message={message} />
              ))}

              {pendingExchange ? (
                <>
                  <MessageCard
                    message={{
                      id: `${pendingExchange.id}-user`,
                      role: "USER",
                      content: pendingExchange.question,
                      createdAt: pendingExchange.createdAt,
                    }}
                  />
                  {pendingExchange.state === "thinking" ? (
                    <ThinkingCard createdAt={pendingExchange.createdAt} />
                  ) : (
                    <FailedResponseCard
                      createdAt={pendingExchange.createdAt}
                      disabled={isSubmitting}
                      onRetry={retryPendingExchange}
                    />
                  )}
                </>
              ) : null}
            </div>
          )}
          <div
            aria-hidden="true"
            className="h-[calc(var(--chat-composer-height,112px)+1.5rem)]"
          />
          <div ref={bottomAnchorRef} aria-hidden="true" className="h-px" />
        </div>

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>

        <form
          ref={composerRef}
          onSubmit={onSubmit}
          className="sticky bottom-0 z-30 border-t border-border bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_28px_rgba(0,0,0,0.08)] sm:px-5"
        >
          {showJumpToLatest && hasMessages ? (
            <button
              type="button"
              onClick={() => scrollToLatest("smooth")}
              aria-label="Jump to latest message"
              className="absolute -top-14 left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ArrowDown className="size-4" />
              {hasUnseenLatest ? (
                <span
                  aria-hidden="true"
                  className="absolute right-0.5 top-0.5 size-2 rounded-full bg-accent ring-2 ring-card"
                />
              ) : null}
            </button>
          ) : null}
          <div className="mx-auto max-w-4xl">
            <div className="flex items-end gap-3">
              <label htmlFor="consultant-message" className="sr-only">
                Message your AI Consultant
              </label>
              <AutoResizeTextarea
                id="consultant-message"
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key !== "Enter" ||
                    event.shiftKey ||
                    event.nativeEvent.isComposing
                  ) {
                    return;
                  }

                  event.preventDefault();
                  if (!input.trim() || requestInFlightRef.current) return;
                  event.currentTarget.form?.requestSubmit();
                }}
                aria-describedby={
                  error || !canSend
                    ? "chat-composer-help chat-composer-error"
                    : "chat-composer-help"
                }
                placeholder="Ask about your audit, website, social media, or next steps..."
                maxLength={2000}
                maxHeight={208}
              />
              <Button
                type="submit"
                size="icon"
                className="mb-1 shrink-0"
                disabled={isSubmitting || !input.trim() || !canSend}
                aria-label={isSubmitting ? "Waiting for consultant response" : "Send message"}
                title="Send message"
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
            <div className="mt-2 flex flex-col gap-1 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
              <p id="chat-composer-help">
                Enter to send | Shift + Enter for a new line
              </p>
              {input.length >= 1600 ? <span>{input.length}/2000</span> : null}
            </div>
            {error || !canSend ? (
              <p
                id="chat-composer-error"
                role="alert"
                className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-200"
              >
                {error || sendDisabledReason || "AI message limit reached."}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
      </div>

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-chat-title"
            aria-describedby="clear-chat-description"
            className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl"
          >
            <h2 id="clear-chat-title" className="text-lg font-semibold">
              Clear chat history?
            </h2>
            <p
              id="clear-chat-description"
              className="mt-2 text-sm leading-6 text-muted"
            >
              This will permanently delete this conversation for this business.
              This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsConfirmOpen(false)}
                disabled={isClearing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={confirmClearChat}
                disabled={isClearing}
              >
                <Trash2 className="size-4" />
                {isClearing ? "Clearing..." : "Clear Chat"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
