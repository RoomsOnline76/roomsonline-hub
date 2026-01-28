import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface DashboardStats {
  totalBookings?: number;
  pendingBookings?: number;
  confirmedBookings?: number;
  totalProperties?: number;
  activeProperties?: number;
  pendingAccessRequests?: number;
  recentBookings?: Array<{
    id: string;
    guest_name: string;
    property_name: string;
    check_in_date: string;
    status: string;
    total_price: number;
  }>;
}

interface NarrativeSummaryProps {
  stats: DashboardStats | null;
  loading?: boolean;
}

/**
 * AI-generated narrative summary for the admin dashboard.
 * Transforms raw stats into plain-language insights.
 * Follows UX principle: intelligence feels organic, no AI badges.
 */
export function NarrativeSummary({ stats, loading }: NarrativeSummaryProps) {
  const [narrative, setNarrative] = useState<string>("");
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNarrative = async () => {
    if (!stats || loading) return;
    
    setNarrativeLoading(true);
    setError(null);

    try {
      const dashboardData = {
        stats: {
          totalBookings: stats.totalBookings || 0,
          confirmedBookings: stats.confirmedBookings || 0,
          pendingBookings: stats.pendingBookings || 0,
          totalProperties: stats.totalProperties || 0,
          activeProperties: stats.activeProperties || 0,
          pendingAccessRequests: stats.pendingAccessRequests || 0,
        },
        recentBookings: stats.recentBookings?.slice(0, 5) || [],
      };

      const { data, error: fnError } = await supabase.functions.invoke(
        "dashboard-insights",
        {
          body: {
            prompt: "Provide a brief executive summary of the current platform status. Focus on: (1) any items needing immediate attention, (2) overall health of the booking pipeline. Be direct and actionable in 2-3 sentences.",
            dashboardData,
          },
        }
      );

      if (fnError) throw fnError;

      if (data?.insight) {
        setNarrative(data.insight);
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error("Error fetching narrative:", err);
      setError("Unable to generate summary");
    } finally {
      setNarrativeLoading(false);
      setHasFetched(true);
    }
  };

  useEffect(() => {
    if (stats && !hasFetched && !loading) {
      fetchNarrative();
    }
  }, [stats, hasFetched, loading]);

  // Don't show anything while initial data is loading
  if (loading && !hasFetched) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <Card className="bg-muted/30 border-none mb-6">
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {narrativeLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : error ? (
                  <p className="text-sm text-muted-foreground italic">{error}</p>
                ) : narrative ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {narrative}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Analyzing your week...
                  </p>
                )}
              </div>
              
              {hasFetched && !narrativeLoading && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={fetchNarrative}
                  title="Refresh insights"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
