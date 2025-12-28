import { CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";

interface WhoItsNotForBadgeProps {
  content: string;
  className?: string;
}

export function WhoItsNotForBadge({ content, className = "" }: WhoItsNotForBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

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
            className={`w-8 h-8 rounded-full bg-amber-100/90 backdrop-blur-sm flex items-center justify-center shadow-md hover:bg-amber-200/90 transition-colors ${className}`}
            aria-label="Who this might not suit"
          >
            <CircleHelp className="w-5 h-5 text-amber-700" />
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          className="max-w-xs bg-amber-50 border-amber-200 text-amber-900"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-medium text-sm mb-1">Who this might not suit</p>
          <p className="text-xs leading-relaxed">{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
