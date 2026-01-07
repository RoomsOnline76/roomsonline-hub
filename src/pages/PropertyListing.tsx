import { useState, useEffect } from "react";
import { PropertySegmentSection } from "@/components/PropertySegmentSection";
import { SegmentFilterId } from "@/lib/segmentFilters";
import { PublicLayout } from "@/components/layout/PublicLayout";

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
    <PublicLayout backLabel="Back to Home" backTo="/">
      {/* Hero Sentence */}
      <div className="bg-muted/30 border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <p className="font-display text-lg sm:text-xl md:text-2xl font-light text-foreground/80 text-center italic max-w-3xl mx-auto">
            {heroSentence}
          </p>
        </div>
      </div>

      {/* Property Segments */}
      <div className="flex-1">
        {ALL_SEGMENTS.map((segmentId) => (
          <PropertySegmentSection
            key={segmentId}
            segmentId={segmentId}
          />
        ))}
      </div>
    </PublicLayout>
  );
}
