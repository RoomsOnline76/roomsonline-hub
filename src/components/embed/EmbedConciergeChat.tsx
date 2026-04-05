import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, X, Loader2 } from "lucide-react";
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

interface EmbedConciergeChatProps {
  propertyId: string;
  propertyName: string;
  roomTypes: { id: string; name: string; max_guests?: number }[];
  brandColor?: string;
  fontColor?: string;
  checkIn?: string;
  checkOut?: string;
  portfolioSlug?: string;
  onBookJourney?: (suggestions: JourneySuggestion[]) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const QUICK_CHIPS = [
  "This weekend for 2",
  "Show me the best room",
  "Under R1500/night",
  "Pet-friendly options",
];

export function EmbedConciergeChat({
  propertyId,
  propertyName,
  roomTypes,
  brandColor = "#e91e63",
  fontColor = "#ffffff",
  checkIn,
  checkOut,
}: EmbedConciergeChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hi! 👋 I'm **TOBI**, your AI travel concierge for ${propertyName}. Tell me your dates, number of guests, room preference, or budget — and I'll find the perfect stay for you!`,
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
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke("ai-booking-concierge", {
        body: {
          property_id: propertyId,
          user_query: msg,
          current_dates: checkIn && checkOut ? { check_in: checkIn, check_out: checkOut } : undefined,
          current_guests: { adults: 2, children: 0, infants: 0 },
          room_types: roomTypes.map((rt) => ({ id: rt.id, name: rt.name, max_guests: rt.max_guests || 2 })),
          session_id: sessionIdRef.current,
          conversation_history: conversationHistory,
        },
      });

      if (error) throw error;

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data?.narrative_response || "I found some options for you!",
        },
      ]);
    } catch (err) {
      console.error("Concierge error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I'm having a moment — please try again or select dates manually above!",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating trigger */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed right-4 bottom-4 z-50 h-12 px-5 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium transition-transform hover:scale-105"
            style={{ background: brandColor, color: fontColor }}
          >
            <Sparkles className="h-4 w-4" />
            Ask TOBI
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed right-4 bottom-4 z-50 w-[340px] max-h-[480px] rounded-2xl border border-border bg-background shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ background: brandColor, color: fontColor }}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <span className="font-semibold text-sm">TOBI — AI Concierge</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1 rounded-full hover:bg-white/20 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[320px]">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      msg.role === "user" ? "text-primary-foreground" : "bg-muted"
                    )}
                    style={msg.role === "user" ? { background: brandColor, color: fontColor } : undefined}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                    {/* Quick chips after welcome */}
                    {msg.id === "welcome" && messages.length <= 1 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {QUICK_CHIPS.map((chip) => (
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
                    <span className="text-xs text-muted-foreground">Thinking...</span>
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
                  placeholder="Ask about rooms, dates, budget..."
                  className="flex-1 h-9 text-sm"
                  disabled={isLoading}
                />
                <Button type="submit" size="icon" className="h-9 w-9" disabled={!input.trim() || isLoading} style={{ background: brandColor, color: fontColor }}>
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
