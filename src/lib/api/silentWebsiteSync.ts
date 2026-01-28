import { supabase } from "@/integrations/supabase/client";
import type { AISuggestion } from "@/components/property/InlineAISuggestion";

export interface SilentSyncResult {
  success: boolean;
  suggestions: AISuggestion[];
  error?: string;
  scrapedUrl?: string;
}

/**
 * Silent background sync from property website.
 * Auto-triggers on URL paste with debouncing.
 * Returns suggestions for inline display (no modal).
 */
export async function silentWebsiteSync(
  propertyId: string | null,
  propertyUrl: string,
  existingData: Record<string, unknown>
): Promise<SilentSyncResult> {
  if (!propertyUrl || (!propertyUrl.startsWith("http://") && !propertyUrl.startsWith("https://"))) {
    return { success: false, suggestions: [], error: "Invalid URL" };
  }

  try {
    const { data, error } = await supabase.functions.invoke("ai-website-sync", {
      body: {
        property_id: propertyId || "new-property",
        property_url: propertyUrl,
        existing_data: existingData,
      },
    });

    if (error) {
      console.error("Silent sync error:", error);
      return {
        success: false,
        suggestions: [],
        error: error.message || "Sync failed",
      };
    }

    if (!data?.success || !data?.suggestions) {
      return {
        success: false,
        suggestions: [],
        error: data?.error || "No suggestions returned",
      };
    }

    // Transform suggestions to inline format
    const inlineSuggestions: AISuggestion[] = data.suggestions
      .filter((s: any) => s.suggested !== null && s.suggested !== undefined)
      .map((s: any) => ({
        fieldKey: extractFieldKey(s.stateVariable),
        fieldLabel: s.fieldLabel,
        suggestedValue: s.suggested,
        currentValue: s.current,
        confidence: s.confidence || 0.8,
        source: (s.source as "website" | "vision" | "inference") || "website",
      }));

    return {
      success: true,
      suggestions: inlineSuggestions,
      scrapedUrl: data.scrapedUrl,
    };
  } catch (err) {
    console.error("Silent sync exception:", err);
    return {
      success: false,
      suggestions: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Extract the actual field key from stateVariable path.
 * e.g., "formData.telephone" -> "telephone"
 */
function extractFieldKey(stateVariable: string): string {
  if (!stateVariable) return "";
  
  // Handle formData.fieldName pattern
  if (stateVariable.startsWith("formData.")) {
    return stateVariable.replace("formData.", "");
  }
  
  // Handle direct field names
  return stateVariable;
}

/**
 * Debounce helper for URL input.
 * Triggers sync after user stops typing.
 */
export function createSyncDebouncer(delayMs = 800) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule: (callback: () => void) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(callback, delayMs);
    },
    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}
