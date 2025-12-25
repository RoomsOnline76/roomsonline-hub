import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertySegmentSection } from "@/components/PropertySegmentSection";
import { SegmentFilterId } from "@/lib/segmentFilters";

// Segment ordering: Luxury | Style first, then type segments, then destination segments
// Excludes "discover_new" (New) segment
const TYPE_SEGMENTS: SegmentFilterId[] = [
  "luxury_style",      // First
  "wow_epic",
  "seclusion_escape",
  "romance",
  "wellness",
  "gastronomy",
  "sustainable",
  "history",
  "arts_culture",
  "family_friendly",
  "adults_only",
];

const DESTINATION_SEGMENTS: SegmentFilterId[] = [
  "city",
  "beach",
  "mountain",
  "countryside",
];

const ALL_SEGMENTS = [...TYPE_SEGMENTS, ...DESTINATION_SEGMENTS];

export default function PropertyListing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header with Back Button */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="gap-2"
            >
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back to Home</span>
                <span className="sm:hidden">Back</span>
              </Link>
            </Button>
            <h1 className="text-base sm:text-lg font-medium text-foreground/80 italic">
              Discover hand-picked extraordinary escapes and places that spark the wanderlust
            </h1>
          </div>
        </div>
      </header>

      {/* Property Segments */}
      <main>
        {ALL_SEGMENTS.map((segmentId) => (
          <PropertySegmentSection
            key={segmentId}
            segmentId={segmentId}
          />
        ))}
      </main>

      {/* Footer */}
      <footer className="py-4 sm:py-6 border-t border-border mt-auto bg-background">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="flex justify-end">
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              © 2025 RoomsOnline
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
