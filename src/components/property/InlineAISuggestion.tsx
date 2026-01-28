import { useState } from "react";
import { Check, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export interface AISuggestion {
  fieldKey: string;
  fieldLabel: string;
  suggestedValue: unknown;
  currentValue: unknown;
  confidence: number;
  source: "website" | "vision" | "inference";
}

interface InlineAISuggestionProps {
  suggestion: AISuggestion;
  onAccept: (suggestion: AISuggestion) => void;
  onDismiss: (fieldKey: string) => void;
  className?: string;
}

/**
 * Subtle inline pill showing AI-suggested value for a field.
 * Appears next to form fields when AI has a suggestion.
 * Following UX principle: no AI labels, intelligence feels organic.
 */
export function InlineAISuggestion({
  suggestion,
  onAccept,
  onDismiss,
  className,
}: InlineAISuggestionProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") {
      return value.length > 40 ? value.substring(0, 40) + "…" : value;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return "";
      return value.slice(0, 3).join(", ") + (value.length > 3 ? "…" : "");
    }
    return String(value);
  };

  const handleAccept = () => {
    setIsAccepting(true);
    setTimeout(() => {
      onAccept(suggestion);
    }, 200);
  };

  const getConfidenceOpacity = (confidence: number) => {
    if (confidence >= 0.9) return "opacity-100";
    if (confidence >= 0.75) return "opacity-90";
    return "opacity-80";
  };

  const displayValue = formatValue(suggestion.suggestedValue);
  if (!displayValue) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -4, scale: 0.95 }}
        animate={{ 
          opacity: isAccepting ? 0 : 1, 
          y: 0, 
          scale: isAccepting ? 0.9 : 1 
        }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs",
          "bg-primary/10 text-primary border border-primary/20",
          "hover:bg-primary/15 transition-colors cursor-default",
          getConfidenceOpacity(suggestion.confidence),
          className
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Sparkles className="h-3 w-3 shrink-0" />
        
        <span className="truncate max-w-[180px]" title={String(suggestion.suggestedValue)}>
          {displayValue}
        </span>

        <div className="flex items-center gap-0.5 ml-1">
          <button
            onClick={handleAccept}
            className="p-0.5 rounded-full hover:bg-primary/20 transition-colors"
            title="Accept suggestion"
            type="button"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onClick={() => onDismiss(suggestion.fieldKey)}
            className="p-0.5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
            title="Dismiss"
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Container for multiple AI suggestions, shown as floating pills.
 * Manages dismiss state and applies suggestions to form.
 */
interface AISuggestionsContainerProps {
  suggestions: AISuggestion[];
  onAccept: (suggestion: AISuggestion) => void;
  onDismiss: (fieldKey: string) => void;
  onAcceptAll?: () => void;
  onDismissAll?: () => void;
  className?: string;
}

export function AISuggestionsContainer({
  suggestions,
  onAccept,
  onDismiss,
  onAcceptAll,
  onDismissAll,
  className,
}: AISuggestionsContainerProps) {
  if (suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        "flex flex-wrap items-center gap-2 p-3 rounded-lg",
        "bg-muted/50 border border-border/50",
        className
      )}
    >
      <span className="text-xs text-muted-foreground shrink-0">
        Suggestions:
      </span>
      
      {suggestions.map((suggestion) => (
        <InlineAISuggestion
          key={suggestion.fieldKey}
          suggestion={suggestion}
          onAccept={onAccept}
          onDismiss={onDismiss}
        />
      ))}

      {suggestions.length > 1 && (
        <div className="flex items-center gap-1 ml-auto">
          {onAcceptAll && (
            <button
              onClick={onAcceptAll}
              className="text-xs text-primary hover:underline"
              type="button"
            >
              Accept all
            </button>
          )}
          {onDismissAll && (
            <>
              <span className="text-muted-foreground">·</span>
              <button
                onClick={onDismissAll}
                className="text-xs text-muted-foreground hover:text-foreground"
                type="button"
              >
                Dismiss all
              </button>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
