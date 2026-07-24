import { useState, useMemo } from "react";
import DOMPurify from "dompurify";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Calendar, ArrowRight } from "lucide-react";
import { format, parseISO, subYears } from "date-fns";

interface Journal {
  id: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  publish_date: string | null;
  header_image_url: string | null;
  slug: string | null;
}

export default function ConnectJournal() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const threeYearsAgo = subYears(new Date(), 3).toISOString();

  const { data: journals, isLoading } = useQuery({
    queryKey: ["connect-journals"],
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

  const filteredJournals = useMemo(() => {
    if (!journals) return [];
    if (!searchQuery.trim()) return journals;
    const q = searchQuery.toLowerCase();
    return journals.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.excerpt?.toLowerCase().includes(q)
    );
  }, [journals, searchQuery]);

  return (
    <div className="min-h-[60vh]">
      {/* Hero */}
      <section className="border-b bg-muted/20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16 lg:py-20">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mb-3">
            Journal
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Product updates, industry insights, and stories from the ROL'OS Connect team.
          </p>

          {/* Search */}
          <div className="mt-8 max-w-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Loading */}
        {isLoading && (
          <div className="grid gap-8 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-48 w-full rounded-lg" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && filteredJournals.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">
              {searchQuery
                ? "No articles match your search."
                : "No articles published yet. Check back soon!"}
            </p>
          </div>
        )}

        {/* Articles grid */}
        {!isLoading && filteredJournals.length > 0 && (
          <div className="grid gap-10 sm:grid-cols-2">
            {filteredJournals.map((journal) => {
              const isExpanded = expandedId === journal.id;

              return (
                <article
                  key={journal.id}
                  className="group flex flex-col"
                >
                  {/* Image */}
                  {journal.header_image_url && (
                    <div className="mb-4 rounded-lg overflow-hidden bg-muted aspect-[16/9]">
                      <img
                        src={journal.header_image_url}
                        alt={journal.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    </div>
                  )}

                  {/* Date */}
                  {journal.publish_date && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <time
                        dateTime={journal.publish_date}
                        className="text-xs uppercase tracking-wider text-muted-foreground"
                      >
                        {format(parseISO(journal.publish_date), "MMMM d, yyyy")}
                      </time>
                    </div>
                  )}

                  {/* Title */}
                  <h2 className="text-xl font-semibold tracking-tight text-foreground mb-2 leading-snug">
                    {journal.title}
                  </h2>

                  {/* Excerpt */}
                  {journal.excerpt && (
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3 line-clamp-3">
                      {journal.excerpt}
                    </p>
                  )}

                  {/* Expand / collapse */}
                  {journal.content && (
                    <>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : journal.id)}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors mt-auto pt-2"
                      >
                        {isExpanded ? "Show less" : "Read more"}
                        <ArrowRight className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                      </button>

                      {isExpanded && (
                        <div
                          className="mt-4 prose prose-sm max-w-none dark:prose-invert 
                            prose-headings:font-semibold prose-headings:tracking-tight
                            prose-headings:text-foreground prose-p:text-foreground/80
                            prose-a:text-primary prose-img:rounded-lg"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(journal.content, {
                              ALLOWED_TAGS: ['p','h1','h2','h3','h4','h5','h6','strong','em','a','ul','ol','li','img','br','blockquote','figure','figcaption','div','span','table','thead','tbody','tr','th','td'],
                              ALLOWED_ATTR: ['href','src','alt','class','target','rel','width','height'],
                            }),
                          }}
                        />
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
