import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Section category definitions
const ADMIN_SECTIONS = [
  "getting_started",
  "booking_flow",
  "roles_permissions",
  "data_authority",
  "architecture",
  "debugging",
  "billing_finance",
];

const OWNER_SECTIONS = [
  "owner_getting_started",
  "booking_categories",
  "availability_pricing",
  "pms_integration",
  "property_appearance",
  "common_mistakes",
  "troubleshooting",
  "support",
  "owner_billing",
];

const DEV_SECTIONS = [
  "system_overview",
];

// Simple debounce function
function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

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
  adminSections: HelpSection[];
  ownerSections: HelpSection[];
  devSections: HelpSection[];
  isAdminUser: boolean;
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredArticles: HelpArticle[];
  getArticleBySlug: (slug: string) => HelpArticle | undefined;
  getArticlesByContext: (table: string, field?: string) => HelpArticle[];
  submitFeedback: (articleId: string, wasHelpful: boolean) => Promise<void>;
}

const HelpContext = createContext<HelpContextType | undefined>(undefined);

const SECTION_ORDER: string[] = [
  // Admin sections
  "getting_started",
  "booking_flow",
  "roles_permissions",
  "data_authority",
  "architecture",
  "debugging",
  // Owner sections
  "owner_getting_started",
  "booking_categories",
  "availability_pricing",
  "pms_integration",
  "property_appearance",
  "common_mistakes",
  "troubleshooting",
  "support",
  // Admin billing
  "billing_finance",
  // Owner billing
  "owner_billing",
];

const SECTION_LABELS: Record<string, string> = {
  // Admin sections
  getting_started: "Getting Started",
  booking_flow: "Booking Flow",
  roles_permissions: "Roles & Permissions",
  data_authority: "Data Authority & Sync",
  architecture: "System Architecture",
  debugging: "Debugging & Monitoring",
  // Owner sections
  owner_getting_started: "Getting Started",
  booking_categories: "Booking Categories",
  availability_pricing: "Availability & Pricing",
  pms_integration: "How ROL Works with Your PMS",
  property_appearance: "Your Property's Appearance",
  common_mistakes: "Common Mistakes to Avoid",
  troubleshooting: "Troubleshooting",
  support: "Getting Help",
  // Admin billing
  billing_finance: "Billing & Finance",
  // Owner billing
  owner_billing: "Your Billing",
};

export function HelpProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentArticleSlug, setCurrentArticleSlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { user, isAdmin, isDev, isFearlessLeader } = useAuth();

  const isAdminUser = isAdmin || isDev || isFearlessLeader;

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

  // Filter articles based on user role - owners only see their articles
  const roleFilteredArticles = useMemo(() => {
    if (isAdminUser) return articles;
    // Regular users see only articles targeting 'user' or 'all'
    return articles.filter(article => 
      article.role_target.includes("user") || 
      article.role_target.includes("all")
    );
  }, [articles, isAdminUser]);

  const sections: HelpSection[] = useMemo(() => {
    return Object.entries(
      roleFilteredArticles.reduce((acc, article) => {
        if (!acc[article.section]) {
          acc[article.section] = [];
        }
        acc[article.section].push(article);
        return acc;
      }, {} as Record<string, HelpArticle[]>)
    )
      .map(([name, sectionArticles]) => ({
        name,
        label: SECTION_LABELS[name] || name,
        articles: sectionArticles.sort((a, b) => a.sort_order - b.sort_order),
      }))
      .sort((a, b) => {
        const orderA = SECTION_ORDER.indexOf(a.name);
        const orderB = SECTION_ORDER.indexOf(b.name);
        return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
      });
  }, [roleFilteredArticles]);

  // Separate sections by category for admin view
  const adminSections = useMemo(() => 
    sections.filter(s => ADMIN_SECTIONS.includes(s.name)),
    [sections]
  );

  const ownerSections = useMemo(() => 
    sections.filter(s => OWNER_SECTIONS.includes(s.name)),
    [sections]
  );

  const devSections = useMemo(() => 
    sections.filter(s => DEV_SECTIONS.includes(s.name)),
    [sections]
  );

  const filteredArticles = searchQuery
    ? articles.filter(
        (article) =>
          article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          article.content_markdown.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : articles;

  // Log search queries (debounced)
  const logSearchRef = useRef(
    debounce(async (query: string, resultsCount: number, userId?: string) => {
      if (!query.trim() || query.length < 2) return;
      try {
        await supabase.from("help_search_logs").insert({
          user_id: userId || null,
          search_query: query.trim().toLowerCase(),
          results_count: resultsCount,
        });
      } catch (error) {
        console.error("Failed to log search:", error);
      }
    }, 1500)
  );

  useEffect(() => {
    if (searchQuery && searchQuery.length >= 2) {
      logSearchRef.current(searchQuery, filteredArticles.length, user?.id);
    }
  }, [searchQuery, filteredArticles.length, user?.id]);

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
        articles: roleFilteredArticles,
        sections,
        adminSections,
        ownerSections,
        devSections,
        isAdminUser,
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
