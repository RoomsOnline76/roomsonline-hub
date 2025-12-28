import { CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useMemo } from "react";

const TOOLTIP_TITLES = [
  "Who this might not suit",
  "Not ideal for",
  "Consider if you're",
  "May not be for you if",
  "Think twice if",
  "Might not match",
  "Worth knowing",
  "Heads up for",
  "A gentle note",
  "Before you book",
];

interface WhoItsNotForBadgeProps {
  content: string;
  className?: string;
}

export function WhoItsNotForBadge({ content, className = "" }: WhoItsNotForBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Consistent random title based on content hash
  const title = useMemo(() => {
    const hash = content.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return TOOLTIP_TITLES[hash % TOOLTIP_TITLES.length];
  }, [content]);

  if (!content || !content.trim()) {
    return null;
  }

  // Handle mobile tap to toggle tooltip
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className={`w-7 h-7 rounded-full bg-muted/80 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-muted transition-colors ${className}`}
            aria-label="Who this might not suit"
          >
            <CircleHelp className="w-4 h-4 text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          className="max-w-xs bg-background border-border text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-medium text-sm mb-1 text-muted-foreground">{title}</p>
          <p className="text-xs leading-relaxed">{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
