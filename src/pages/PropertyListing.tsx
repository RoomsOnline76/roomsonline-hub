import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertySegmentSection } from "@/components/PropertySegmentSection";
import { SegmentFilterId } from "@/lib/segmentFilters";
import { PublicFooter } from "@/components/layout/PublicFooter";
import rolLogo from "@/assets/rol-logo.png";

const HERO_SENTENCES = [
  "Discover hand-picked extraordinary escapes and places that spark the wanderlust",
  "Pursue the remarkable and find places that forever spark the spirit",
  "Explore thoughtfully curated destinations crafted to inspire your next adventure",
  "Uncover hidden gems and extraordinary places that define exceptional travel",
  "Journey to remarkable destinations where every stay becomes a story",
];

// Segment ordering: Luxury | Style first, then type segments, then destination segments
// Excludes "discover_new" (New) segment
const TYPE_SEGMENTS: SegmentFilterId[] = [
  "luxury_style",
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
  const [heroSentence, setHeroSentence] = useState("");

  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * HERO_SENTENCES.length);
    setHeroSentence(HERO_SENTENCES[randomIndex]);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header with Back Button */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Back button */}
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="gap-2 font-normal"
            >
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back to Home</span>
                <span className="sm:hidden">Back</span>
              </Link>
            </Button>

            {/* Center: Logo */}
            <Link to="/" className="absolute left-1/2 -translate-x-1/2">
              <img
                src={rolLogo}
                alt="RoomsOnline"
                className="h-8 sm:h-10 w-auto"
              />
            </Link>

            {/* Right: Placeholder for balance */}
            <div className="w-24" />
          </div>
        </div>
      </header>

      {/* Hero Sentence */}
      <div className="bg-muted/30 border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <p className="font-display text-lg sm:text-xl md:text-2xl font-light text-foreground/80 text-center italic max-w-3xl mx-auto">
            {heroSentence}
          </p>
        </div>
      </div>

      {/* Property Segments */}
      <main className="flex-1">
        {ALL_SEGMENTS.map((segmentId) => (
          <PropertySegmentSection
            key={segmentId}
            segmentId={segmentId}
          />
        ))}
      </main>

      {/* Footer */}
      <PublicFooter />
    </div>
  );
}
