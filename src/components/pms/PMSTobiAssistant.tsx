import { useState, useRef, useEffect, useCallback } from "react";
import { Cat, Send, Sparkles, RotateCcw, Navigation } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PMSTobiAssistantProps {
  propertyName?: string;
}

const PMS_SUGGESTED_PROMPTS = [
  "What's happening today?",
  "Show occupancy & revenue",
  "How do I connect an OTA?",
  "Walk me through group bookings",
  "What can my front desk staff see?",
  "Navigate to housekeeping",
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-assistant`;

export function PMSTobiAssistant({ propertyName }: PMSTobiAssistantProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { propertyId } = usePmsPropertyId();
  
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: propertyName 
        ? `Hey there! I'm TOBI, your assistant for **${propertyName}** 🐱\n\nI know this property inside-out — ask me about rooms, rates, bookings, or where to find things in the PMS!`
        : "Hi! I'm TOBI, your ROL'OS assistant 🐱 Select a property and I'll help you manage it!",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Reset chat when property changes
  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content: propertyName 
          ? `Hey there! I'm TOBI, your assistant for **${propertyName}** 🐱\n\nI know this property inside-out — ask me about rooms, rates, bookings, or where to find things in the PMS!`
          : "Hi! I'm TOBI, your ROL'OS assistant 🐱 Select a property and I'll help you manage it!",
      },
    ]);
  }, [propertyId, propertyName]);

  const streamChat = useCallback(
    async ({
      messages: chatMessages,
      onDelta,
      onDone,
    }: {
      messages: Message[];
      onDelta: (deltaText: string) => void;
      onDone: () => void;
    }) => {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: chatMessages,
          userRole: user?.user_metadata?.role || "user",
          pmsContext: propertyId ? { propertyId } : undefined,
        }),
      });

      if (!resp.ok) {
        const error = await resp.json().catch(() => ({ error: "Something went wrong" }));
        throw new Error(error.error || "Failed to get response");
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) onDelta(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      onDone();
    },
    [user, propertyId]
  );

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const updateAssistant = (nextChunk: string) => {
      assistantSoFar += nextChunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev.length > 1 && prev[prev.length - 2].role === "user") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: [...messages, userMsg],
        onDelta: (chunk) => updateAssistant(chunk),
        onDone: () => setIsLoading(false),
      });
    } catch (error) {
      console.error("TOBI error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Oops! ${error instanceof Error ? error.message : "Something went wrong"} 🐱 Try again or contact support@roomsonline.co.za for help.`,
        },
      ]);
      setIsLoading(false);
    }
  };

  const resetChat = () => {
    setMessages([
      {
        role: "assistant",
        content: propertyName 
          ? `Hey there! I'm TOBI, your assistant for **${propertyName}** 🐱\n\nI know this property inside-out — ask me about rooms, rates, bookings, or where to find things in the PMS!`
          : "Hi! I'm TOBI, your ROL'OS assistant 🐱 Select a property and I'll help you manage it!",
      },
    ]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Quick navigation buttons
  const quickNavItems = [
    { label: "Dashboard", path: "/pms" },
    { label: "Rooms", path: "/pms/rooms" },
    { label: "Guests", path: "/pms/guests" },
    { label: "Rates", path: "/pms/rate-plans" },
    { label: "Revenue", path: "/pms/revenue" },
    { label: "Channels", path: "/pms/channels" },
    { label: "Messaging", path: "/pms/messaging" },
    { label: "Reports", path: "/pms/reports" },
    { label: "Staff", path: "/pms/staff" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Cat className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">TOBI</h3>
            <p className="text-xs text-muted-foreground">
              {propertyName ? `${propertyName} Assistant` : "PMS Guide"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {propertyId && (
            <Badge variant="outline" className="text-xs">
              Property Connected
            </Badge>
          )}
          <Button variant="ghost" size="icon" onClick={resetChat} title="Start new chat">
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Quick Nav */}
      {propertyId && (
        <div className="px-4 py-2 border-b bg-muted/20">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
            <Navigation className="w-3 h-3" />
            Quick nav:
          </div>
          <div className="flex flex-wrap gap-1">
            {quickNavItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(`${item.path}?property=${propertyId}`)}
                className="text-xs px-2 py-0.5 rounded bg-background border hover:bg-muted transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Cat className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "rounded-lg px-3 py-2 max-w-[85%] text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-2 justify-start">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                <Cat className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-3 py-2">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Suggested Prompts */}
      {messages.length === 1 && propertyId && (
        <div className="px-4 pb-2">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Try asking:
          </p>
          <div className="flex flex-wrap gap-1">
            {PMS_SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={propertyId ? "Ask about this property..." : "Ask TOBI anything..."}
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
