import { supabase } from "@/integrations/supabase/client";

export interface WebsiteSyncSuggestion {
  stateVariable: string;
  fieldLabel: string;
  current: unknown;
  suggested: unknown;
  confidence: number;
  source: string;
}

export interface WebsiteSyncResponse {
  success: boolean;
  error?: string;
  suggestions?: WebsiteSyncSuggestion[];
  scrapedUrl?: string;
}

export async function syncFromWebsite(
  propertyId: string,
  propertyUrl: string,
  existingData: Record<string, unknown>,
  tripadvisorId?: string,
  additionalUrls?: string[],
  googlePlaceId?: string
): Promise<WebsiteSyncResponse> {
  const { data, error } = await supabase.functions.invoke("ai-website-sync", {
    body: {
      property_id: propertyId,
      property_url: propertyUrl,
      existing_data: existingData,
      tripadvisor_id: tripadvisorId,
      additional_urls: additionalUrls?.filter(u => u?.startsWith("http")) || [],
      google_place_id: googlePlaceId || undefined,
    },
  });

  if (error) {
    console.error("Website sync error:", error);
    return {
      success: false,
      error: error.message || "Failed to sync from website",
    };
  }

  return data as WebsiteSyncResponse;
}
