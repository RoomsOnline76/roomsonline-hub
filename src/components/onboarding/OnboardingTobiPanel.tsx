import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cat, ChevronDown, ChevronUp, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export interface OnboardingTobiBlocker {
  label: string;
  detail?: string;
  section?: string;
  fieldKey?: string;
  unit?: string;
  mandatory?: boolean;
}

export interface OnboardingTobiContext {
  wizard: "channel" | "website";
  propertyId: string;
  propertyName: string;
  stage?: string;
  stepTitle: string;
  stepGoal?: string;
  stepLocked?: boolean;
  previousStep?: string;
  score?: number;
  blockers: OnboardingTobiBlocker[];
}

interface Props {
  context: OnboardingTobiContext;
  defaultOpen?: boolean;
  onOpenField?: (section: string, fieldKey?: string, unit?: string) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-assistant`;

function parseOpenField(content: string): {
  clean: string;
  target: { section: string; fieldKey?: string; unit?: string } | null;
} {
  const match = content.match(/```action\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/);
  if (!match) return { clean: content, target: null };
  const clean = content.replace(match[0], "").trim();
  try {
    const action = JSON.parse(match[1]) as {
      type?: string;
      section?: string;
      fieldKey?: string;
      unit?: string | null;
    };
    if (action.type !== "open_field" || !action.section) return { clean, target: null };
    return {
      clean,
      target: {
        section: action.section,
        fieldKey: action.fieldKey,
        unit: action.unit || undefined,
      },
    };
  } catch {
    return { clean, target: null };
  }
}

export function OnboardingTobiPanel({ context, defaultOpen = false, onOpenField }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const greeting = useMemo(() => {
    const first = context.blockers[0];
    if (context.stepLocked) {
      return `I'm TOBI 🐱 This step is locked until **${context.previousStep || "the previous step"}** is done. Ask me what that step still needs.`;
    }
    if (first) {
      return `I'm TOBI 🐱 I can see **${first.label}** is still open on ${context.stepTitle}. Ask why it fails, or what to do next — I'll work with the checks already on this page.`;
    }
    return `I'm TOBI 🐱 **${context.stepTitle}** looks clear on this page. Ask if you're unsure what happens next.`;
  }, [context.stepLocked, context.previousStep, context.blockers, context.stepTitle, context.wizard]);

  useEffect(() => {
    setMessages([{ role: "assistant", content: greeting }]);
  }, [greeting, context.stepTitle, context.wizard]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const suggestions = useMemo(() => {
    const first = context.blockers[0];
    const out = ["What do I do next?"];
    if (first) out.unshift(`Why is "${first.label}" failing?`);
    if (context.wizard === "channel") out.push("What does unbound mean here?");
    return out.slice(0, 3);
  }, [context.blockers, context.wizard]);

  const streamChat = useCallback(
    async (chatMessages: Message[], onDelta: (text: string) => void) => {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
          userRole: user?.user_metadata?.role || "user",
          onboardingContext: context,
        }),
      });
      if (!resp.ok) {
        const error = await resp.json().catch(() => ({ error: "Something went wrong" }));
        throw new Error(error.error || "Failed to get a reply");
      }
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const chunk = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (chunk) onDelta(chunk);
          } catch {
            buffer = `${line}\n${buffer}`;
            break;
          }
        }
      }
    },
    [context, user],
  );

  const send = async (text?: string) => {
    const content = (text || input).trim();
    if (!content || isLoading) return;
    const userMsg: Message = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    let soFar = "";
    const paint = (chunk: string) => {
      soFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev[prev.length - 2]?.role === "user") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: soFar } : m));
        }
        return [...prev, { role: "assistant", content: soFar }];
      });
    };
    try {
      await streamChat([...messages, userMsg], paint);
      const { clean, target } = parseOpenField(soFar);
      if (clean !== soFar) {
        setMessages((prev) =>
          prev.map((m, i) => (i === prev.length - 1 && m.role === "assistant" ? { ...m, content: clean } : m)),
        );
      }
      if (target && onOpenField) onOpenField(target.section, target.fieldKey, target.unit);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `I couldn't reach the help desk just now. ${error instanceof Error ? error.message : ""} Ask again, or use the checks listed on this step.`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-md border border-primary/20 bg-primary/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Cat className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 text-xs font-medium">
          Ask TOBI about this step
          {context.blockers.length > 0 ? ` · ${context.blockers.length} open` : ""}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="space-y-2 border-t px-3 py-2">
          <div ref={scrollRef} className="max-h-48 space-y-2 overflow-y-auto">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs",
                  msg.role === "user" ? "ml-6 bg-primary text-primary-foreground" : "mr-4 bg-muted",
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs [&_p]:my-0.5 [&_ul]:my-0.5">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <p className="text-[11px] text-muted-foreground">TOBI is reading this step…</p>
            )}
          </div>
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send(prompt)}
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask about this check…"
              disabled={isLoading}
              className="h-8 text-xs"
            />
            <Button type="button" size="icon" className="h-8 w-8" disabled={!input.trim() || isLoading} onClick={() => void send()}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
