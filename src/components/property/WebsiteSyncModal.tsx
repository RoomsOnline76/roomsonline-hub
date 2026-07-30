import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

import { AlertTriangle, Check, ExternalLink } from "lucide-react";
import { WebsiteSyncSuggestion } from "@/lib/api/websiteSync";

export type { WebsiteSyncSuggestion };

// Safe URL hostname extraction to prevent crashes on invalid URLs
const getHostname = (url: string): string => {
  if (!url) return "Unknown";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

interface WebsiteSyncModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: WebsiteSyncSuggestion[];
  scrapedUrl: string;
  onApply: (selectedSuggestions: WebsiteSyncSuggestion[]) => void;
}

export function WebsiteSyncModal({
  open,
  onOpenChange,
  suggestions,
  scrapedUrl,
  onApply,
}: WebsiteSyncModalProps) {
  // Pre-select suggestions where current value is empty
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Re-initialize selection whenever suggestions change (modal reopen)
  useEffect(() => {
    const initial = new Set<string>();
    suggestions.forEach((s) => {
      const isEmpty = !s.current || 
        (typeof s.current === "string" && s.current.trim() === "") ||
        (Array.isArray(s.current) && s.current.length === 0);
      if (isEmpty) {
        initial.add(s.stateVariable);
      }
    });
    setSelected(initial);
  }, [suggestions]);

  const toggleSelection = (stateVariable: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(stateVariable)) {
        next.delete(stateVariable);
      } else {
        next.add(stateVariable);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelected(new Set(suggestions.map(s => s.stateVariable)));
  };

  const handleSelectNone = () => {
    setSelected(new Set());
  };

  const handleApply = () => {
    const selectedSuggestions = suggestions.filter((s) =>
      selected.has(s.stateVariable)
    );
    onApply(selectedSuggestions);
    onOpenChange(false);
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "(empty)";
    if (typeof value === "string") {
      if (value.trim() === "") return "(empty)";
      // Truncate long strings
      return value.length > 100 ? value.substring(0, 100) + "..." : value;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return "(empty)";
      return value.slice(0, 5).join(", ") + (value.length > 5 ? "..." : "");
    }
    return String(value);
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.9) return "text-success";
    if (confidence >= 0.75) return "text-warning";
    return "text-warning";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-primary" />
            Website Auto-fill Suggestions
          </DialogTitle>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            Scanned: 
            <a 
              href={scrapedUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              {getHostname(scrapedUrl)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </DialogHeader>

        {suggestions.length > 0 && (
          <div className="flex items-center justify-between py-2 border-b shrink-0">
            <span className="text-sm text-muted-foreground">
              {selected.size} of {suggestions.length} selected
            </span>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleSelectAll}
              >
                Select All
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleSelectNone}
                disabled={selected.size === 0}
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          <div className="space-y-3 py-2">
            {suggestions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No extractable information found on the website.
              </p>
            ) : (
              suggestions.map((suggestion) => {
                const isSelected = selected.has(suggestion.stateVariable);
                const hasExisting = suggestion.current && 
                  (typeof suggestion.current !== "string" || suggestion.current.trim() !== "") &&
                  (!Array.isArray(suggestion.current) || suggestion.current.length > 0);

                return (
                  <div
                    key={suggestion.stateVariable}
                    className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                      isSelected 
                        ? "border-primary bg-primary/5" 
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                    onClick={() => toggleSelection(suggestion.stateVariable)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(suggestion.stateVariable)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {suggestion.fieldLabel}
                          </span>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getConfidenceColor(suggestion.confidence)}`}
                          >
                            {Math.round(suggestion.confidence * 100)}%
                          </Badge>
                        </div>
                        
                        <div className="text-xs space-y-1">
                          <div className="flex gap-2">
                            <span className="text-muted-foreground shrink-0">Current:</span>
                            <span className="text-muted-foreground truncate">
                              {formatValue(suggestion.current)}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-muted-foreground shrink-0">Suggested:</span>
                            <span className="text-foreground">
                              {formatValue(suggestion.suggested)}
                            </span>
                          </div>
                        </div>

                        {hasExisting && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Field already has data</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleApply}
            disabled={selected.size === 0}
          >
            Apply {selected.size} Selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
