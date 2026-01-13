import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sparkles, Send, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface InsightPanelProps {
  title?: string;
  description?: string;
  placeholder?: string;
  onAnalyze: (prompt: string) => Promise<string | null>;
  className?: string;
  triggerClassName?: string;
  children?: React.ReactNode;
}

export function InsightPanel({
  title = "AI Insights",
  description = "Ask questions about your data",
  placeholder = "Ask a question...",
  onAnalyze,
  className,
  triggerClassName,
  children,
}: InsightPanelProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ prompt: string; response: string }[]>([]);

  const handleSubmit = async () => {
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setInsight(null);

    try {
      const response = await onAnalyze(prompt);
      if (response) {
        setInsight(response);
        setHistory(prev => [...prev, { prompt, response }]);
        setPrompt("");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children || (
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-2", triggerClassName)}
          >
            <Sparkles className="h-4 w-4" />
            AI Assist
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className={cn("w-[400px] sm:w-[540px]", className)}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {title}
          </SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Input */}
          <div className="flex gap-2">
            <Input
              placeholder={placeholder}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={handleSubmit} disabled={loading || !prompt.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Current insight */}
          {insight && (
            <div className="rounded-lg bg-muted/50 p-4 animate-fade-in">
              <p className="text-sm leading-relaxed">{insight}</p>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="space-y-3 pt-4 border-t">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Previous Insights
              </h4>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {history.slice().reverse().map((item, index) => (
                  <div
                    key={index}
                    className="rounded-lg border bg-card p-3 space-y-2"
                  >
                    <p className="text-xs font-medium text-primary">
                      {item.prompt}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.response}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {history.length === 0 && !insight && !loading && (
            <div className="text-center py-8">
              <Sparkles className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Ask a question to get AI-powered insights about your data
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Floating trigger button for use anywhere
export function InsightPanelTrigger({
  title,
  description,
  placeholder,
  onAnalyze,
  className,
}: {
  title?: string;
  description?: string;
  placeholder?: string;
  onAnalyze: (prompt: string) => Promise<string | null>;
  className?: string;
}) {
  return (
    <InsightPanel
      title={title}
      description={description}
      placeholder={placeholder}
      onAnalyze={onAnalyze}
    >
      <Button
        size="icon"
        className={cn(
          "fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg z-50",
          className
        )}
      >
        <Sparkles className="h-5 w-5" />
      </Button>
    </InsightPanel>
  );
}
