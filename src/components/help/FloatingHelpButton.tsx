import { useEffect } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHelp } from "@/contexts/HelpContext";
import { useAuth } from "@/hooks/useAuth";

export function FloatingHelpButton() {
  const { toggleHelp, isOpen } = useHelp();
  const { user } = useAuth();

  // Keyboard shortcut: ? to open help
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Check for ? key (shift + /)
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleHelp();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleHelp]);

  // Only show for authenticated users
  if (!user) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-shadow"
            onClick={toggleHelp}
            aria-label="Open help"
            aria-expanded={isOpen}
          >
            <HelpCircle className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="flex items-center gap-2">
          <span>Help & Guidance</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ?
          </kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
