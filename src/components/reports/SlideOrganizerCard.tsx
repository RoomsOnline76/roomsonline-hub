import { useMemo } from "react";
import { useReportMedia } from "@/hooks/useReportMedia";
import { mediaImagePageKey, mediaPageKey, type ReportPageDefinition } from "@/lib/reportPages";
import { SlideOrganizer } from "./SlideOrganizer";

/**
 * Wires the slide organizer to the run's media pages.
 *
 * Grouped slots (Channel Performance, Booking.com, Expedia) contribute one row
 * per section. Exploded slots — the additional slides and any custom section the
 * reviewer created — contribute one row per image, each carrying its own title
 * and caption so it can be placed individually in the printed order.
 */
export function SlideOrganizerCard({
  runId,
  sourceType,
  propertyId,
}: {
  runId: string;
  sourceType?: string | null;
  propertyId?: string;
}) {
  const media = useReportMedia(runId, sourceType, propertyId);

  const { mediaPages, legacyExpansions } = useMemo(() => {
    const sections: { section: string; images: number; titles: string[] }[] = [];
    const perImage: ReportPageDefinition[] = [];
    const expansions: Record<string, string[]> = {};

    for (const slot of media.slots) {
      const exploded = slot.definition.explode === true || slot.definition.isCustom;

      if (exploded) {
        slot.images.forEach((image, index) => {
          const title =
            (image.section_title ?? "").trim() || `${slot.definition.title} ${index + 1}`;
          const key = mediaImagePageKey(image.id);
          perImage.push({
            key,
            title,
            summary: (image.caption ?? "").trim() || `Pasted slide · ${slot.definition.section}`,
          });
          const legacyKey = mediaPageKey(slot.definition.section);
          expansions[legacyKey] = [...(expansions[legacyKey] ?? []), key];
        });
        continue;
      }

      // Built-in grouped slots only appear once they carry an image.
      if (slot.images.length === 0) continue;

      const titles = slot.images
        .map((image) => (image.section_title ?? "").trim() || slot.definition.title)
        .filter((title, index, arr) => arr.indexOf(title) === index);

      const existing = sections.find((entry) => entry.section === slot.definition.section);
      if (existing) {
        existing.images += slot.images.length;
        for (const title of titles) {
          if (!existing.titles.includes(title)) existing.titles.push(title);
        }
      } else {
        sections.push({
          section: slot.definition.section,
          images: slot.images.length,
          titles: titles.length > 0 ? titles : [slot.definition.title],
        });
      }
    }

    const sectionPages: ReportPageDefinition[] = sections.map((entry) => {
      const countLabel = `${entry.images} image${entry.images === 1 ? "" : "s"}`;
      const titleList = entry.titles.filter(Boolean).join(", ");
      return {
        key: mediaPageKey(entry.section),
        title: entry.section,
        summary: titleList ? `${countLabel} · ${titleList}` : countLabel,
      };
    });

    return { mediaPages: [...sectionPages, ...perImage], legacyExpansions: expansions };
  }, [media.slots]);

  return (
    <SlideOrganizer
      runId={runId}
      mediaPages={mediaPages}
      legacyExpansions={legacyExpansions}
      propertyId={propertyId}
    />
  );
}
