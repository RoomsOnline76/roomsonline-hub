import { useState, useMemo, useEffect } from "react";
import DOMPurify from "dompurify";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PublicBreadcrumb } from "@/components/layout/PublicBreadcrumb";
import { usePageSEO } from "@/hooks/usePageSEO";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Calendar } from "lucide-react";
import { format, subYears, parseISO } from "date-fns";

interface Journal {
  id: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  publish_date: string | null;
  header_image_url: string | null;
  slug: string | null;
}

export default function PublicJournals() {
  const [searchQuery, setSearchQuery] = useState("");
  const location = useLocation();
  
  const threeYearsAgo = subYears(new Date(), 3).toISOString();

  const { data: journals, isLoading } = useQuery({
    queryKey: ["public-journals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journals")
        .select("id, title, excerpt, content, publish_date, header_image_url, slug")
        .eq("status", "published")
        .gte("publish_date", threeYearsAgo)
        .order("publish_date", { ascending: false });

      if (error) throw error;
      return data as Journal[];
    },
  });

  // Scroll to anchor on load
  useEffect(() => {
    if (journals && location.hash) {
      const elementId = location.hash.slice(1);
      setTimeout(() => {
        const element = document.getElementById(elementId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    }
  }, [journals, location.hash]);

  const filteredJournals = useMemo(() => {
    if (!journals) return [];
    if (!searchQuery.trim()) return journals;

    const query = searchQuery.toLowerCase();
    return journals.filter(
      (journal) =>
        journal.title.toLowerCase().includes(query) ||
        journal.excerpt?.toLowerCase().includes(query) ||
        journal.content?.toLowerCase().includes(query)
    );
  }, [journals, searchQuery]);

  return (
    <PublicLayout backLabel="Back to Home" backTo="/">
      <div className="container mx-auto px-4 sm:px-6 py-16 sm:py-20">
        {/* Page title */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="font-display text-3xl sm:text-4xl font-light tracking-tight leading-tight text-foreground mb-4">
            Journal
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Stories & Inspiration
          </p>
        </div>

        {/* Search */}
        <div className="max-w-md mx-auto mb-12">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background focus-visible:ring-primary/30"
            />
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="max-w-3xl mx-auto space-y-12">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-64 w-full rounded-lg" />
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filteredJournals.length === 0 && (
          <div className="max-w-md mx-auto text-center py-16">
            <p className="font-display text-xl text-muted-foreground">
              {searchQuery
                ? "No articles match your search."
                : "No articles published yet. Check back soon!"}
            </p>
          </div>
        )}

        {/* Journal list */}
        {!isLoading && filteredJournals.length > 0 && (
          <div className="max-w-3xl mx-auto space-y-12">
            {filteredJournals.map((journal) => (
              <article
                key={journal.id}
                id={`journal-${journal.slug || journal.id}`}
                className="scroll-mt-24"
              >
                {/* Header Image */}
                {journal.header_image_url && (
                  <div className="mb-6 rounded-lg overflow-hidden bg-muted">
                    <img
                      src={journal.header_image_url}
                      alt={journal.title}
                      className="w-full h-64 sm:h-80 object-cover"
                    />
                  </div>
                )}

                {/* Title & Meta */}
                <h2 className="font-display text-2xl sm:text-3xl font-light tracking-tight leading-tight text-foreground mb-3">
                  {journal.title}
                </h2>
                
                {journal.publish_date && (
                  <div className="flex items-center gap-2 mb-6">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <time 
                      dateTime={journal.publish_date}
                      className="text-xs uppercase tracking-wider text-muted-foreground"
                    >
                      {format(parseISO(journal.publish_date), "MMMM d, yyyy")}
                    </time>
                  </div>
                )}

                {/* Excerpt */}
                {journal.excerpt && (
                  <p className="text-lg text-foreground/70 italic mb-6 leading-relaxed">
                    {journal.excerpt}
                  </p>
                )}

                {/* Content */}
                {journal.content && (
                  <div
                    className="prose prose-lg max-w-none dark:prose-invert 
                      prose-headings:font-sans prose-headings:font-medium prose-headings:tracking-tight
                      prose-headings:text-foreground prose-p:text-foreground/80 prose-p:leading-relaxed
                      prose-strong:text-foreground prose-a:text-primary
                      prose-img:rounded-lg prose-li:marker:text-primary/50"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(journal.content, {
                      ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'img', 'br', 'blockquote', 'figure', 'figcaption', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
                      ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'target', 'rel', 'width', 'height'],
                    }) }}
                  />
                )}

                {/* Separator */}
                <div className="mt-12 border-t border-border" />
              </article>
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
