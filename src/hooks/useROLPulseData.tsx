import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ROLPulseData {
  tier1: {
    gbv: number;
    rolRevenue: number;
    avgCommissionRate: number;
    netBookings: number;
  };
  tier2: {
    channelBreakdown: Array<{
      channel: string;
      gbv: number;
      commission: number;
      count: number;
    }>;
    topProperties: Array<{
      id: string;
      name: string;
      gbv: number;
      commission: number;
      count: number;
    }>;
  };
  tier3: {
    cancellationRate: number;
    syncFailureCount: number;
    lowPerformingProperties: number;
  };
  timeline: Array<{
    date: string;
    gbv: number;
    commission: number;
    count: number;
  }>;
  dateRange: {
    start: string;
    end: string;
  };
}

interface DateRange {
  start: string;
  end: string;
}

export function useROLPulseData(dateRange: DateRange) {
  const { isAdmin, isDev } = useAuth();
  const canView = isAdmin || isDev;

  return useQuery<ROLPulseData>({
    queryKey: ["rol-pulse", dateRange.start, dateRange.end],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await supabase.functions.invoke("revenue-pulse-api", {
        body: { 
          action: "get_rol_pulse", 
          dateRange 
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to fetch ROL pulse data");
      }

      return response.data as ROLPulseData;
    },
    enabled: canView,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
