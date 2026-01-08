import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface HelpArticle {
  id: string;
  title: string;
  slug: string;
  section: string;
  content_markdown: string;
  role_target: string[];
  sort_order: number;
  related_table: string | null;
  related_field: string | null;
  impact_level: "critical" | "warning" | "info";
  is_published: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

interface HelpSection {
  name: string;
  label: string;
  articles: HelpArticle[];
}

interface HelpContextType {
  isOpen: boolean;
  openHelp: (articleSlug?: string) => void;
  closeHelp: () => void;
  toggleHelp: () => void;
  currentArticleSlug: string | null;
  setCurrentArticleSlug: (slug: string | null) => void;
  articles: HelpArticle[];
  sections: HelpSection[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredArticles: HelpArticle[];
  getArticleBySlug: (slug: string) => HelpArticle | undefined;
  getArticlesByContext: (table: string, field?: string) => HelpArticle[];
  submitFeedback: (articleId: string, wasHelpful: boolean) => Promise<void>;
}

const HelpContext = createContext<HelpContextType | undefined>(undefined);

const SECTION_LABELS: Record<string, string> = {
  getting_started: "Getting Started",
  booking_categories: "Booking Categories",
  availability_pricing: "Availability & Pricing",
  troubleshooting: "Troubleshooting",
  common_mistakes: "Common Mistakes to Avoid",
  architecture: "System Architecture",
  roles_permissions: "Roles & Permissions",
  data_authority: "Data Authority & Sync",
  booking_flow: "Booking Flow",
  debugging: "Debugging & Monitoring",
};

export function HelpProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentArticleSlug, setCurrentArticleSlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAuth();

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["help-articles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("*")
        .eq("is_published", true)
        .order("section")
        .order("sort_order");

      if (error) {
        console.error("Error fetching help articles:", error);
        return [];
      }

      return data as HelpArticle[];
    },
    staleTime: 1000 * 60 * 60, // 1 hour cache
    enabled: !!user,
  });

  const sections: HelpSection[] = Object.entries(
    articles.reduce((acc, article) => {
      if (!acc[article.section]) {
        acc[article.section] = [];
      }
      acc[article.section].push(article);
      return acc;
    }, {} as Record<string, HelpArticle[]>)
  ).map(([name, sectionArticles]) => ({
    name,
    label: SECTION_LABELS[name] || name,
    articles: sectionArticles.sort((a, b) => a.sort_order - b.sort_order),
  }));

  const filteredArticles = searchQuery
    ? articles.filter(
        (article) =>
          article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          article.content_markdown.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : articles;

  const openHelp = useCallback((articleSlug?: string) => {
    setIsOpen(true);
    if (articleSlug) {
      setCurrentArticleSlug(articleSlug);
    }
  }, []);

  const closeHelp = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
  }, []);

  const toggleHelp = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const getArticleBySlug = useCallback(
    (slug: string) => articles.find((article) => article.slug === slug),
    [articles]
  );

  const getArticlesByContext = useCallback(
    (table: string, field?: string) =>
      articles.filter(
        (article) =>
          article.related_table === table &&
          (!field || article.related_field === field)
      ),
    [articles]
  );

  const submitFeedback = useCallback(
    async (articleId: string, wasHelpful: boolean) => {
      if (!user) return;

      try {
        await supabase.from("user_help_views").upsert(
          {
            user_id: user.id,
            article_id: articleId,
            was_helpful: wasHelpful,
            viewed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,article_id" }
        );
      } catch (error) {
        console.error("Error submitting feedback:", error);
      }
    },
    [user]
  );

  return (
    <HelpContext.Provider
      value={{
        isOpen,
        openHelp,
        closeHelp,
        toggleHelp,
        currentArticleSlug,
        setCurrentArticleSlug,
        articles,
        sections,
        isLoading,
        searchQuery,
        setSearchQuery,
        filteredArticles,
        getArticleBySlug,
        getArticlesByContext,
        submitFeedback,
      }}
    >
      {children}
    </HelpContext.Provider>
  );
}

export function useHelp() {
  const context = useContext(HelpContext);
  if (context === undefined) {
    throw new Error("useHelp must be used within a HelpProvider");
  }
  return context;
}
