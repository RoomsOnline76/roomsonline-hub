import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useHelp } from "@/contexts/HelpContext";
import { cn } from "@/lib/utils";

interface ContextualHelpProps {
  table: string;
  field?: string;
  className?: string;
}

export function ContextualHelp({ table, field, className }: ContextualHelpProps) {
  const { getArticlesByContext, openHelp } = useHelp();
  
  const articles = getArticlesByContext(table, field);
  
  if (articles.length === 0) return null;

  const primaryArticle = articles[0];
  
  // Extract first paragraph from markdown for tooltip preview
  const getPreview = (markdown: string): string => {
    const lines = markdown.split('\n').filter(line => 
      line.trim() && 
      !line.startsWith('#') && 
      !line.startsWith('|') &&
      !line.startsWith('```') &&
      !line.startsWith(':::')
    );
    const firstParagraph = lines[0] || '';
    return firstParagraph.length > 150 
      ? firstParagraph.substring(0, 150) + '...' 
      : firstParagraph;
  };

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-5 w-5 ml-1 text-muted-foreground hover:text-foreground", className)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openHelp(primaryArticle.slug);
          }}
          type="button"
        >
          <Info className="h-3.5 w-3.5" />
          <span className="sr-only">Help for {field || table}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent 
        side="top" 
        align="start"
        className="max-w-md z-[100]"
        sideOffset={5}
        avoidCollisions={true}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          <p className="font-medium text-sm">{primaryArticle.title}</p>
          <p className="text-xs text-muted-foreground whitespace-normal break-words">
            {getPreview(primaryArticle.content_markdown)}
          </p>
          <p className="text-xs text-primary">Click for more details</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
