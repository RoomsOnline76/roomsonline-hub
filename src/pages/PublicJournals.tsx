import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, Calendar } from "lucide-react";
import { format, subYears } from "date-fns";

export default function PublicJournals() {
  const [searchQuery, setSearchQuery] = useState("");
  
  const threeYearsAgo = subYears(new Date(), 3).toISOString();

  const { data: journals, isLoading } = useQuery({
    queryKey: ["public-journals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journals")
        .select("*")
        .eq("status", "published")
        .gte("publish_date", threeYearsAgo)
        .order("publish_date", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const filteredJournals = useMemo(() => {
    if (!journals) return [];
    if (!searchQuery.trim()) return journals;

    const query = searchQuery.toLowerCase();
    return journals.filter(
      (journal) =>
        journal.title.toLowerCase().includes(query) ||
        (journal.content && journal.content.toLowerCase().includes(query))
    );
  }, [journals, searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Journal</h1>
              <p className="text-muted-foreground mt-1">
                Stories, insights, and travel inspiration
              </p>
            </div>
            
            {/* Search */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search journals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="space-y-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-64 bg-muted rounded-lg mb-4" />
                <div className="h-8 bg-muted rounded w-2/3 mb-2" />
                <div className="h-4 bg-muted rounded w-1/4 mb-4" />
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredJournals.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-lg">
              {searchQuery
                ? "No journals found matching your search."
                : "No journals published yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-16">
            {filteredJournals.map((journal) => (
              <article
                key={journal.id}
                className="border-b border-border pb-16 last:border-b-0"
              >
                {/* Header Image */}
                {journal.header_image_url && (
                  <div className="mb-6">
                    <img
                      src={journal.header_image_url}
                      alt={journal.title}
                      className="w-full h-64 md:h-96 object-cover rounded-lg"
                    />
                  </div>
                )}

                {/* Title & Meta */}
                <header className="mb-6">
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                    {journal.title}
                  </h2>
                  {journal.publish_date && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Calendar className="h-4 w-4" />
                      <time dateTime={journal.publish_date}>
                        {format(new Date(journal.publish_date), "MMMM d, yyyy")}
                      </time>
                    </div>
                  )}
                </header>

                {/* Excerpt */}
                {journal.excerpt && (
                  <p className="text-lg text-muted-foreground mb-6 italic">
                    {journal.excerpt}
                  </p>
                )}

                {/* Content */}
                {journal.content && (
                  <div
                    className="prose prose-lg max-w-none dark:prose-invert 
                      prose-headings:text-foreground prose-p:text-foreground 
                      prose-strong:text-foreground prose-a:text-primary
                      prose-img:rounded-lg"
                    dangerouslySetInnerHTML={{ __html: journal.content }}
                  />
                )}
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-8 mt-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>&copy; {new Date().getFullYear()} Sleep in Africa. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
