import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Loader2, MapPin, Calendar, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

interface JourneySuggestion {
  property_id: string;
  property_name: string;
  property_slug: string;
  city: string;
  check_in: string;
  check_out: string;
  starting_rate?: number;
  currency?: string;
  hero_image?: string;
}

interface TobiJourneyAssistantProps {
  currentPropertyId: string;
  currentPropertyName: string;
  currentCheckIn: string;
  currentCheckOut: string;
  portfolioSlug?: string;
  brandColor?: string;
  brandFontColor?: string;
  onSelectProperty?: (suggestion: JourneySuggestion) => void;
  onBrowsePortfolio?: () => void;
  onClose?: () => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: JourneySuggestion[];
}

const JOURNEY_CHIPS = [
  "Add another stop after",
  "Somewhere nearby before",
  "Beach destination next",
  "Show me options",
];

export function TobiJourneyAssistant({
  currentPropertyId,
  currentPropertyName,
  currentCheckIn,
  currentCheckOut,
  portfolioSlug,
  brandColor = "#e91e63",
  brandFontColor = "#ffffff",
  onSelectProperty,
  onBrowsePortfolio,
  onClose,
}: TobiJourneyAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Love your choice of **${currentPropertyName}**! 🌟 Where would you like to go next?\n\nI can suggest places **before** (arriving ${currentCheckIn}) or **after** your stay (from ${currentCheckOut}).`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const conversationHistory = messages
        .filter((m) => m.id !== "welcome")
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke("ai-booking-concierge", {
        body: {
          property_id: currentPropertyId,
          user_query: msg,
          mode: "journey_builder",
          current_dates: { check_in: currentCheckIn, check_out: currentCheckOut },
          current_guests: { adults: 2, children: 0, infants: 0 },
          portfolio_slug: portfolioSlug,
          current_stay: {
            property_name: currentPropertyName,
            check_in: currentCheckIn,
            check_out: currentCheckOut,
          },
          session_id: sessionIdRef.current,
          conversation_history: conversationHistory,
        },
      });

      if (error) throw error;

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.narrative_response || "Let me help you plan your next stop!",
        suggestions: data?.journey_suggestions || [],
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error("Journey assistant error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I'm having a moment — try browsing the portfolio directly!",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="rounded-xl border border-border bg-background shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ background: brandColor, color: brandFontColor }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="font-semibold text-sm">TOBI — Journey Builder</span>
        </div>
        <div className="flex items-center gap-1">
          {onBrowsePortfolio && (
            <button
              onClick={onBrowsePortfolio}
              className="text-xs px-2 py-1 rounded-full hover:bg-white/20 transition-colors"
            >
              Browse all
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="overflow-y-auto p-3 space-y-3 max-h-[280px]">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[90%] rounded-2xl px-3 py-2 text-sm",
                msg.role === "user" ? "text-primary-foreground" : "bg-muted"
              )}
              style={msg.role === "user" ? { background: brandColor, color: brandFontColor } : undefined}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p>{msg.content}</p>
              )}

              {/* Journey suggestions */}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="mt-2 space-y-2">
                  {msg.suggestions.map((s) => (
                    <button
                      key={s.property_id}
                      onClick={() => onSelectProperty?.(s)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg bg-background border border-border hover:border-primary/40 transition-colors text-left"
                    >
                      {s.hero_image && (
                        <img src={s.hero_image} alt={s.property_name} className="w-12 h-12 rounded-md object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate">{s.property_name}</p>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <MapPin className="h-2.5 w-2.5" />
                          <span>{s.city}</span>
                          <span>·</span>
                          <Calendar className="h-2.5 w-2.5" />
                          <span>{s.check_in} → {s.check_out}</span>
                        </div>
                        {s.starting_rate && (
                          <p className="text-[10px] font-medium mt-0.5" style={{ color: brandColor }}>
                            From {s.currency || "ZAR"} {s.starting_rate}/night
                          </p>
                        )}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {/* Quick chips after welcome */}
              {msg.id === "welcome" && messages.length <= 1 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {JOURNEY_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => sendMessage(chip)}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl px-3 py-2 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-xs text-muted-foreground">Planning your journey...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Where to next? Beach, city, nature..."
            className="flex-1 h-9 text-sm"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9"
            disabled={!input.trim() || isLoading}
            style={{ background: brandColor, color: brandFontColor }}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </motion.div>
  );
}
