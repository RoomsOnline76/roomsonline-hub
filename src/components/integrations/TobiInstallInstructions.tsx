import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TobiInstallInstructionsProps {
  /** Property the snippet belongs to. */
  propertyId: string;
  /** Integration flavour, e.g. "direct" | "widget" | "booking_bar" | "wordpress". */
  integrationType: string;
  /** The exact snippet shown to the owner (already white-label / portfolio aware). */
  snippet: string;
  /** Optional label override for the trigger button. */
  label?: string;
}

/**
 * Asks TOBI to write plain-language install steps for the snippet the owner is
 * about to copy. The snippet is generated locally by the surrounding tab, so the
 * instructions always describe the correct URL (including white-label hosts and
 * portfolio targets) rather than a re-derived one.
 */
export function TobiInstallInstructions({
  propertyId,
  integrationType,
  snippet,
  label = "TOBI: write install instructions",
}: TobiInstallInstructionsProps) {
  const [loading, setLoading] = useState(false);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!propertyId || !snippet) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-integration-assets", {
        body: {
          property_id: propertyId,
          integration_type: integrationType,
          snippet,
        },
      });
      if (error) throw error;
      const text = (data as { instructions?: string } | null)?.instructions?.trim();
      if (!text) throw new Error("TOBI did not return any instructions");
      setInstructions(text);
    } catch (err) {
      toast({
        title: "Could not generate instructions",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!instructions) return;
    await navigator.clipboard.writeText(instructions);
    setCopied(true);
    toast({ title: "Instructions copied" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        disabled={loading || !propertyId || !snippet}
        className="gap-1.5 text-xs"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {instructions ? "Rewrite install instructions" : label}
      </Button>

      {instructions && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Install instructions from TOBI</span>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 shrink-0 gap-1.5 text-xs">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground sm:text-sm">{instructions}</p>
        </div>
      )}
    </div>
  );
}
