"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import { Send, Mic, Square, Sparkles } from "lucide-react";
import clsx from "clsx";
import { Card, Button } from "@/components/ui/primitives";
import { sendBriefingMessage } from "@/lib/actions/briefing";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { ConfirmationCard } from "./confirmation-card";
import { formatTime } from "@/lib/date";
import type { BriefingAction, ExistingItemContext } from "@/lib/ai/briefing-types";
import type { BriefingMessage } from "@prisma/client";

export function AssistantPanel({
  initialMessages,
  initialPendingConfirmation,
  initialPendingClarification,
  existingItems,
}: {
  initialMessages: BriefingMessage[];
  initialPendingConfirmation: BriefingAction[] | null;
  initialPendingClarification: { question: string } | null;
  existingItems: ExistingItemContext[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [pendingConfirmation, setPendingConfirmation] = useState(initialPendingConfirmation);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "USER", text: trimmed, createdAt: new Date(), briefingId: "" },
    ]);
    setInput("");

    startTransition(async () => {
      const result = await sendBriefingMessage(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-a-${Date.now()}`,
          role: "ASSISTANT",
          text: result.reply,
          createdAt: new Date(),
          briefingId: "",
        },
      ]);
      if (result.requiresConfirmation && "actions" in result) {
        setPendingConfirmation(result.actions ?? null);
      }
    });
  }

  const { supported: micSupported, listening, start: startListening, stop: stopListening } =
    useSpeechRecognition((finalText) => submit(finalText));

  const hasClarification = !pendingConfirmation && messages.length > 0 &&
    messages[messages.length - 1]?.role === "ASSISTANT" &&
    initialPendingClarification;

  return (
    <Card className="flex h-[520px] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles size={16} />
        </span>
        <div>
          <p className="text-sm font-bold leading-tight">Din arbejdsassistent</p>
          <p className="text-xs text-muted">Skriv eller tal om dagens arbejde</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted">
            <p className="text-2xl">☀️</p>
            <p className="font-semibold text-foreground">Godmorgen!</p>
            <p>Fortæl mig hvad der skal ske i dag — helt almindeligt sprog.</p>
            <p className="italic text-xs">
              F.eks. &quot;Vi har 8 vaske fra haven, 2 er taget af natholdet, og 3 juletræer skal ryddes op.&quot;
            </p>
          </div>
        )}

        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}

        {pendingConfirmation && (
          <ConfirmationCard
            actions={pendingConfirmation}
            existingItems={existingItems}
            onResolved={() => setPendingConfirmation(null)}
          />
        )}

        {pending && (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:0.15s]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:0.3s]" />
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-end gap-2 border-t border-border p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          rows={1}
          placeholder={hasClarification ? "Svar her..." : "Skriv om dagens arbejde..."}
          className="max-h-24 flex-1 resize-none rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        {micSupported && (
          <button
            type="button"
            onClick={() => (listening ? stopListening() : startListening())}
            className={clsx(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition",
              listening ? "animate-pulse bg-danger text-white" : "bg-surface-2 text-muted hover:text-foreground"
            )}
          >
            {listening ? <Square size={16} /> : <Mic size={18} />}
          </button>
        )}
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </form>
    </Card>
  );
}

function ChatBubble({ message }: { message: BriefingMessage }) {
  const isUser = message.role === "USER";
  return (
    <div className={clsx("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm",
          isUser ? "bg-accent text-accent-foreground" : "bg-surface-2 text-foreground"
        )}
      >
        {message.text}
        <p className={clsx("mt-1 text-[10px] opacity-60", isUser ? "text-right" : "")}>
          {formatTime(new Date(message.createdAt))}
        </p>
      </div>
    </div>
  );
}
