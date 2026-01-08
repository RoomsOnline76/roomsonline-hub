import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Eye, 
  Search, 
  ThumbsUp, 
  ThumbsDown, 
  AlertTriangle,
  TrendingDown,
  FileWarning
} from "lucide-react";
import { subDays, format } from "date-fns";

interface HelpArticle {
  id: string;
  title: string;
  section: string;
  view_count: number;
  impact_level: string | null;
}

interface SearchLog {
  search_query: string;
  results_count: number;
  created_at: string;
}

interface FeedbackView {
  article_id: string;
  was_helpful: boolean | null;
  help_articles: {
    id: string;
    title: string;
    section: string;
  } | null;
}

type DateRange = "7d" | "30d" | "all";

const SECTION_LABELS: Record<string, string> = {
  getting_started: "Getting Started",
  booking_flow: "Booking Flow",
  roles_permissions: "Roles & Permissions",
  data_authority: "Data Authority & Sync",
  architecture: "System Architecture",
  debugging: "Debugging & Monitoring",
  booking_categories: "Booking Categories",
  availability_pricing: "Availability & Pricing",
  troubleshooting: "Troubleshooting",
  common_mistakes: "Common Mistakes",
};

export function HelpAnalyticsDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");

  const fromDate = useMemo(() => {
    if (dateRange === "all") return null;
    const days = dateRange === "7d" ? 7 : 30;
    return subDays(new Date(), days).toISOString();
  }, [dateRange]);

  // Fetch most viewed articles
  const { data: topArticles, isLoading: loadingArticles } = useQuery({
    queryKey: ["help-analytics-views"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("id, title, section, view_count, impact_level")
        .order("view_count", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as HelpArticle[];
    },
  });

  // Fetch search logs
  const { data: searchLogs, isLoading: loadingSearches } = useQuery({
    queryKey: ["help-analytics-searches", dateRange],
    queryFn: async () => {
      let query = supabase
        .from("help_search_logs")
        .select("search_query, results_count, created_at")
        .order("created_at", { ascending: false });

      if (fromDate) {
        query = query.gte("created_at", fromDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SearchLog[];
    },
  });

  // Fetch feedback data
  const { data: feedbackData, isLoading: loadingFeedback } = useQuery({
    queryKey: ["help-analytics-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_help_views")
        .select(`
          article_id,
          was_helpful,
          help_articles!inner(id, title, section)
        `)
        .not("was_helpful", "is", null);
      if (error) throw error;
      return data as FeedbackView[];
    },
  });

  // Aggregate search stats
  const searchStats = useMemo(() => {
    if (!searchLogs) return { terms: [], zeroResultsCount: 0, totalSearches: 0 };

    const termCounts: Record<string, { count: number; zeroResults: number }> = {};
    let zeroResultsCount = 0;

    searchLogs.forEach((log) => {
      const term = log.search_query.toLowerCase();
      if (!termCounts[term]) {
        termCounts[term] = { count: 0, zeroResults: 0 };
      }
      termCounts[term].count++;
      if (log.results_count === 0) {
        termCounts[term].zeroResults++;
        zeroResultsCount++;
      }
    });

    const terms = Object.entries(termCounts)
      .map(([term, stats]) => ({ term, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return { terms, zeroResultsCount, totalSearches: searchLogs.length };
  }, [searchLogs]);

  // Aggregate feedback stats
  const feedbackStats = useMemo(() => {
    if (!feedbackData) return { articles: [], overallHelpful: 0, totalFeedback: 0 };

    const articleFeedback: Record<string, {
      title: string;
      section: string;
      helpful: number;
      notHelpful: number;
    }> = {};

    feedbackData.forEach((view) => {
      if (!view.article_id || !view.help_articles) return;
      const id = view.article_id;
      if (!articleFeedback[id]) {
        articleFeedback[id] = {
          title: view.help_articles.title,
          section: view.help_articles.section,
          helpful: 0,
          notHelpful: 0,
        };
      }
      if (view.was_helpful) {
        articleFeedback[id].helpful++;
      } else {
        articleFeedback[id].notHelpful++;
      }
    });

    const articles = Object.entries(articleFeedback)
      .map(([id, stats]) => ({
        id,
        ...stats,
        total: stats.helpful + stats.notHelpful,
        rating: Math.round((stats.helpful / (stats.helpful + stats.notHelpful)) * 100),
      }))
      .sort((a, b) => b.total - a.total);

    const totalHelpful = articles.reduce((sum, a) => sum + a.helpful, 0);
    const totalFeedback = articles.reduce((sum, a) => sum + a.total, 0);
    const overallHelpful = totalFeedback > 0 ? Math.round((totalHelpful / totalFeedback) * 100) : 0;

    return { articles, overallHelpful, totalFeedback };
  }, [feedbackData]);

  // Articles needing improvement
  const needsImprovement = useMemo(() => {
    if (!topArticles || !feedbackStats.articles.length) return [];

    const feedbackByArticle = feedbackStats.articles.reduce((acc, a) => {
      acc[a.id] = a;
      return acc;
    }, {} as Record<string, typeof feedbackStats.articles[0]>);

    return topArticles
      .map((article) => {
        const feedback = feedbackByArticle[article.id];
        const negativeRatio = feedback
          ? feedback.notHelpful / (feedback.helpful + feedback.notHelpful)
          : 0;

        // Score: higher = needs more improvement
        const improvementScore =
          (article.view_count < 5 ? 40 : article.view_count < 10 ? 20 : 0) +
          (negativeRatio > 0.5 ? 40 : negativeRatio > 0.3 ? 25 : 0) +
          (article.impact_level === "critical" && article.view_count < 10 ? 20 : 0);

        return { ...article, feedback, improvementScore, negativeRatio };
      })
      .filter((a) => a.improvementScore > 0)
      .sort((a, b) => b.improvementScore - a.improvementScore)
      .slice(0, 8);
  }, [topArticles, feedbackStats.articles]);

  const maxViews = topArticles?.[0]?.view_count || 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Help Analytics</CardTitle>
          <div className="flex gap-1">
            {(["7d", "30d", "all"] as DateRange[]).map((range) => (
              <Badge
                key={range}
                variant={dateRange === range ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setDateRange(range)}
              >
                {range === "all" ? "All Time" : range}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="views" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="views" className="text-xs sm:text-sm">
              <Eye className="h-3 w-3 mr-1 hidden sm:inline" />
              Most Viewed
            </TabsTrigger>
            <TabsTrigger value="searches" className="text-xs sm:text-sm">
              <Search className="h-3 w-3 mr-1 hidden sm:inline" />
              Searches
            </TabsTrigger>
            <TabsTrigger value="feedback" className="text-xs sm:text-sm">
              <ThumbsUp className="h-3 w-3 mr-1 hidden sm:inline" />
              Feedback
            </TabsTrigger>
            <TabsTrigger value="improve" className="text-xs sm:text-sm">
              <AlertTriangle className="h-3 w-3 mr-1 hidden sm:inline" />
              Needs Work
            </TabsTrigger>
          </TabsList>

          {/* Most Viewed Tab */}
          <TabsContent value="views" className="space-y-3">
            {loadingArticles ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : topArticles?.length ? (
              topArticles.map((article, index) => (
                <div key={article.id} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-5">{index + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{article.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {SECTION_LABELS[article.section] || article.section}
                    </p>
                  </div>
                  <Progress
                    value={(article.view_count / maxViews) * 100}
                    className="w-24 h-2"
                  />
                  <span className="text-sm text-muted-foreground w-12 text-right">
                    {article.view_count}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No view data yet
              </p>
            )}
          </TabsContent>

          {/* Search Terms Tab */}
          <TabsContent value="searches" className="space-y-3">
            {loadingSearches ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : searchStats.terms.length ? (
              <>
                <div className="flex gap-4 mb-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total searches:</span>{" "}
                    <span className="font-medium">{searchStats.totalSearches}</span>
                  </div>
                  {searchStats.zeroResultsCount > 0 && (
                    <div className="text-destructive">
                      <FileWarning className="h-4 w-4 inline mr-1" />
                      {searchStats.zeroResultsCount} with no results
                    </div>
                  )}
                </div>
                {searchStats.terms.map((term) => (
                  <div key={term.term} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <code className="text-sm bg-muted px-2 py-0.5 rounded">
                        {term.term}
                      </code>
                      {term.zeroResults > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {term.zeroResults} no results
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {term.count} {term.count === 1 ? "search" : "searches"}
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No search data yet
              </p>
            )}
          </TabsContent>

          {/* Feedback Tab */}
          <TabsContent value="feedback" className="space-y-3">
            {loadingFeedback ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : feedbackStats.articles.length ? (
              <>
                <div className="flex gap-4 mb-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Overall rating:</span>{" "}
                    <Badge variant={feedbackStats.overallHelpful >= 70 ? "default" : "secondary"}>
                      {feedbackStats.overallHelpful}% helpful
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total feedback:</span>{" "}
                    <span className="font-medium">{feedbackStats.totalFeedback}</span>
                  </div>
                </div>
                {feedbackStats.articles.slice(0, 10).map((article) => (
                  <div key={article.id} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{article.title}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-sm">
                        <ThumbsUp className="h-3 w-3 text-green-500" />
                        <span>{article.helpful}</span>
                      </div>
                      <div className="flex items-center gap-1 text-sm">
                        <ThumbsDown className="h-3 w-3 text-destructive" />
                        <span>{article.notHelpful}</span>
                      </div>
                      <Badge
                        variant={
                          article.rating >= 70
                            ? "default"
                            : article.rating >= 50
                            ? "secondary"
                            : "destructive"
                        }
                        className="w-16 justify-center"
                      >
                        {article.rating}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No feedback yet
              </p>
            )}
          </TabsContent>

          {/* Needs Improvement Tab */}
          <TabsContent value="improve" className="space-y-3">
            {loadingArticles || loadingFeedback ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : needsImprovement.length ? (
              needsImprovement.map((article) => (
                <div
                  key={article.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{article.title}</p>
                    <div className="flex gap-2 mt-1">
                      {article.view_count < 10 && (
                        <Badge variant="outline" className="text-xs">
                          <TrendingDown className="h-3 w-3 mr-1" />
                          Low views ({article.view_count})
                        </Badge>
                      )}
                      {article.negativeRatio > 0.3 && (
                        <Badge variant="destructive" className="text-xs">
                          <ThumbsDown className="h-3 w-3 mr-1" />
                          {Math.round(article.negativeRatio * 100)}% negative
                        </Badge>
                      )}
                      {article.impact_level === "critical" && article.view_count < 10 && (
                        <Badge variant="secondary" className="text-xs">
                          Critical but unread
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Score</span>
                    <p className="text-lg font-bold text-destructive">
                      {article.improvementScore}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <ThumbsUp className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  All articles are performing well!
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
