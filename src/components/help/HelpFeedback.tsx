import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHelp } from "@/contexts/HelpContext";
import { cn } from "@/lib/utils";

interface HelpFeedbackProps {
  articleId: string;
  className?: string;
}

export function HelpFeedback({ articleId, className }: HelpFeedbackProps) {
  const { submitFeedback } = useHelp();
  const [submitted, setSubmitted] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFeedback = async (wasHelpful: boolean) => {
    if (isSubmitting || submitted !== null) return;
    
    setIsSubmitting(true);
    try {
      await submitFeedback(articleId, wasHelpful);
      setSubmitted(wasHelpful);
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted !== null) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <Check className="h-4 w-4 text-green-500" />
        <span>Thanks for your feedback!</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="text-sm text-muted-foreground">Was this helpful?</span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFeedback(true)}
          disabled={isSubmitting}
          className="h-8 gap-1.5"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          Yes
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFeedback(false)}
          disabled={isSubmitting}
          className="h-8 gap-1.5"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          No
        </Button>
      </div>
    </div>
  );
}
