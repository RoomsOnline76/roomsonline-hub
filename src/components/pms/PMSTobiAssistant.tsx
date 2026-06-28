import { useState, useRef, useEffect, useCallback } from "react";
import { Cat, Send, Sparkles, RotateCcw, Navigation, Zap, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  actionResult?: ActionResult | null;
}

interface ActionResult {
  type: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

interface PMSTobiAssistantProps {
  propertyName?: string;
  isPortfolio?: boolean;
  portfolioPropertyIds?: string[];
  portfolioName?: string;
}

const PMS_SUGGESTED_PROMPTS = [
  "What's happening today?",
  "Show occupancy & revenue",
  "How do room-specific charges work?",
  "How do I manage voucher codes?",
  "Run the night audit",
  "Who's arriving today?",
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-assistant`;

// Parse action blocks from assistant message content
function parseActionBlock(content: string): { cleanContent: string; action: { type: string } | null } {
  const actionRegex = /```action\s*\n?\s*(\{[^}]+\})\s*\n?\s*```/;
  const match = content.match(actionRegex);
  if (!match) return { cleanContent: content, action: null };
  const cleanContent = content.replace(actionRegex, "").trim();
  try {
    const action = JSON.parse(match[1]);
    return { cleanContent, action };
  } catch {
    return { cleanContent: content, action: null };
  }
}

// Render action result as a card
function ActionResultCard({ result }: { result: ActionResult }) {
  if (!result.success) {
    return (
      <Card className="mt-2 border-destructive/30 bg-destructive/5">
        <CardContent className="p-3 text-xs text-destructive">
          ⚠️ {result.error || "Action failed"}
        </CardContent>
      </Card>
    );
  }

  const d = result.data || {};

  switch (result.type) {
    case "occupancy_summary":
      return (
        <Card className="mt-2 border-primary/20 bg-primary/5">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Zap className="w-3 h-3" /> Occupancy — {d.date as string}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>🏨 Total: <strong>{d.total_rooms as number}</strong></div>
              <div>📊 Occupancy: <strong>{d.occupancy_percent as number}%</strong></div>
              <div>✅ Available: <strong>{d.available as number}</strong></div>
              <div>🔒 Occupied: <strong>{d.occupied as number}</strong></div>
              {(d.maintenance as number) > 0 && <div>🔧 Maintenance: {d.maintenance as number}</div>}
              {(d.blocked as number) > 0 && <div>🚫 Blocked: {d.blocked as number}</div>}
            </div>
          </CardContent>
        </Card>
      );

    case "todays_arrivals": {
      const arrivals = (d.arrivals || []) as Array<{ guest_name: string; total_price: number }>;
      const departures = (d.departures || []) as Array<{ guest_name: string }>;
      return (
        <Card className="mt-2 border-primary/20 bg-primary/5">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Zap className="w-3 h-3" /> Today — {d.date as string}
            </div>
            <div className="text-xs space-y-1">
              <div className="font-medium">Arrivals ({d.arrival_count as number}):</div>
              {arrivals.length > 0 ? arrivals.map((a, i) => (
                <div key={i} className="pl-2">• {a.guest_name} — R{a.total_price}</div>
              )) : <div className="pl-2 text-muted-foreground">None</div>}
              <div className="font-medium mt-1">Departures ({d.departure_count as number}):</div>
              {departures.length > 0 ? departures.map((dep, i) => (
                <div key={i} className="pl-2">• {dep.guest_name}</div>
              )) : <div className="pl-2 text-muted-foreground">None</div>}
            </div>
          </CardContent>
        </Card>
      );
    }

    case "revenue_snapshot": {
      const channels = (d.channel_breakdown || {}) as Record<string, number>;
      return (
        <Card className="mt-2 border-primary/20 bg-primary/5">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Zap className="w-3 h-3" /> Revenue — {d.period as string}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>💰 Revenue: <strong>R{(d.total_revenue as number || 0).toLocaleString()}</strong></div>
              <div>📋 Bookings: <strong>{d.booking_count as number}</strong></div>
              <div>📈 Avg Value: <strong>R{(d.avg_booking_value as number || 0).toLocaleString()}</strong></div>
            </div>
            {Object.keys(channels).length > 0 && (
              <div className="text-xs space-y-0.5 pt-1 border-t border-primary/10">
                <div className="font-medium">By Channel:</div>
                {Object.entries(channels).map(([ch, amt]) => (
                  <div key={ch} className="pl-2">• {ch}: R{amt.toLocaleString()}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    case "trigger_night_audit":
      return (
        <Card className="mt-2 border-primary/20 bg-primary/5">
          <CardContent className="p-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-primary mb-1">
              <Zap className="w-3 h-3" /> Night Audit Triggered
            </div>
            <div className="text-muted-foreground">
              The night audit has been queued. Check the <strong>Night Audit</strong> page for results.
            </div>
          </CardContent>
        </Card>
      );

    default:
      return (
        <Card className="mt-2 border-muted">
          <CardContent className="p-3 text-xs text-muted-foreground">
            Action completed: {result.type}
          </CardContent>
        </Card>
      );
  }
}

export function PMSTobiAssistant({ propertyName }: PMSTobiAssistantProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { propertyId } = usePmsPropertyId();
  
  const makeGreeting = useCallback((name?: string): string =>
    name 
      ? `Hey there! I'm TOBI, your assistant for **${name}** 🐱\n\nI can help with rooms, rates, bookings, run the night audit, pull live stats, and more. Just ask!`
      : "Hi! I'm TOBI, your ROL'OS assistant 🐱 Select a property and I'll help you manage it!",
    []
  );

  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: makeGreeting(propertyName) },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [executingAction, setExecutingAction] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    setMessages([{ role: "assistant", content: makeGreeting(propertyName) }]);
  }, [propertyId, propertyName, makeGreeting]);

  // Execute an action via the edge function
  const executeAction = useCallback(async (actionType: string): Promise<ActionResult | null> => {
    if (!propertyId) return null;
    setExecutingAction(true);
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [],
          userRole: user?.user_metadata?.role || "user",
          pmsContext: { propertyId },
          actionRequest: { type: actionType },
        }),
      });
      if (!resp.ok) return { type: actionType, success: false, error: "Action request failed" };
      return await resp.json() as ActionResult;
    } catch (err) {
      return { type: actionType, success: false, error: err instanceof Error ? err.message : "Unknown error" };
    } finally {
      setExecutingAction(false);
    }
  }, [propertyId, user]);

  const streamChat = useCallback(
    async ({
      messages: chatMessages,
      onDelta,
      onDone,
    }: {
      messages: Message[];
      onDelta: (deltaText: string) => void;
      onDone: (fullText: string) => void;
    }) => {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
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
      let fullText = "";

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
            if (content) {
              fullText += content;
              onDelta(content);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      onDone(fullText);
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
      const { cleanContent } = parseActionBlock(assistantSoFar);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev.length > 1 && prev[prev.length - 2].role === "user") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: cleanContent } : m));
        }
        return [...prev, { role: "assistant", content: cleanContent }];
      });
    };

    try {
      await streamChat({
        messages: [...messages, userMsg],
        onDelta: (chunk) => updateAssistant(chunk),
        onDone: async (fullText) => {
          const { cleanContent, action } = parseActionBlock(fullText);
          
          if (action && propertyId) {
            // Update message to clean content first
            setMessages((prev) => {
              const lastIdx = prev.length - 1;
              if (prev[lastIdx]?.role === "assistant") {
                return prev.map((m, i) => i === lastIdx ? { ...m, content: cleanContent } : m);
              }
              return prev;
            });
            
            // Execute the action
            const result = await executeAction(action.type);
            
            // Attach action result to the assistant message
            setMessages((prev) => {
              const lastIdx = prev.length - 1;
              if (prev[lastIdx]?.role === "assistant") {
                return prev.map((m, i) => i === lastIdx ? { ...m, actionResult: result } : m);
              }
              return prev;
            });
          }
          
          setIsLoading(false);
        },
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
    setMessages([{ role: "assistant", content: makeGreeting(propertyName) }]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

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
              <div className="max-w-[85%]">
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
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
                {/* Action result card */}
                {msg.actionResult && <ActionResultCard result={msg.actionResult} />}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
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

          {/* Action executing indicator */}
          {executingAction && (
            <div className="flex gap-2 justify-start">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-primary">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Executing action...
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
