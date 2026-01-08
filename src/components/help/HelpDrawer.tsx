import { useEffect } from "react";
import { ChevronLeft, X, BookOpen, FileText } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useHelp } from "@/contexts/HelpContext";
import { HelpSearch } from "./HelpSearch";
import { HelpMarkdownRenderer } from "./HelpMarkdownRenderer";
import { HelpFeedback } from "./HelpFeedback";
import { ImpactBadge } from "./ImpactBadge";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function HelpDrawer() {
  const {
    isOpen,
    closeHelp,
    currentArticleSlug,
    setCurrentArticleSlug,
    sections,
    isLoading,
    searchQuery,
    filteredArticles,
    getArticleBySlug,
  } = useHelp();

  const currentArticle = currentArticleSlug
    ? getArticleBySlug(currentArticleSlug)
    : null;

  // Keyboard shortcut to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        closeHelp();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeHelp]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeHelp()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl p-0 flex flex-col"
      >
        <SheetHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentArticle && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentArticleSlug(null)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <BookOpen className="h-5 w-5 text-primary" />
              <SheetTitle className="text-lg font-semibold">
                {currentArticle ? currentArticle.title : "Help & Guidance"}
              </SheetTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={closeHelp}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {!currentArticle && (
            <div className="pt-3">
              <HelpSearch />
            </div>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : currentArticle ? (
              // Article View
              <div className="space-y-6">
                {currentArticle.impact_level !== "info" && (
                  <ImpactBadge level={currentArticle.impact_level} />
                )}
                <HelpMarkdownRenderer content={currentArticle.content_markdown} />
                <div className="pt-4 border-t border-border">
                  <HelpFeedback articleId={currentArticle.id} />
                </div>
              </div>
            ) : searchQuery ? (
              // Search Results
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {filteredArticles.length} result
                  {filteredArticles.length !== 1 ? "s" : ""} for "{searchQuery}"
                </p>
                {filteredArticles.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No articles found. Try a different search term.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredArticles.map((article) => (
                      <button
                        key={article.id}
                        onClick={() => setCurrentArticleSlug(article.slug)}
                        className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                            <div>
                              <p className="font-medium text-sm">
                                {article.title}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {sections.find((s) => s.name === article.section)
                                  ?.label || article.section}
                              </p>
                            </div>
                          </div>
                          {article.impact_level !== "info" && (
                            <ImpactBadge
                              level={article.impact_level}
                              className="flex-shrink-0"
                            />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Section Navigation
              <Accordion type="multiple" defaultValue={[sections[0]?.name]}>
                {sections.map((section) => (
                  <AccordionItem key={section.name} value={section.name}>
                    <AccordionTrigger className="text-sm font-medium hover:no-underline">
                      {section.label}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-1 pl-1">
                        {section.articles.map((article) => (
                          <button
                            key={article.id}
                            onClick={() => setCurrentArticleSlug(article.slug)}
                            className={cn(
                              "w-full text-left p-2 rounded-md text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2",
                              article.impact_level === "critical" &&
                                "text-destructive"
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                              {article.title}
                            </span>
                            {article.impact_level !== "info" && (
                              <ImpactBadge
                                level={article.impact_level}
                                className="scale-90"
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
