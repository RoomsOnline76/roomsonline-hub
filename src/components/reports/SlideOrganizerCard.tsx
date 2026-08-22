import { useMemo } from "react";
import { useReportMedia } from "@/hooks/useReportMedia";
import { SlideOrganizer } from "./SlideOrganizer";

export interface OrganizerMediaSection {
  section: string;
  images: number;
  /** Distinct headings the reviewer typed for images in this section. */
  titles: string[];
}

/**
 * Wires the slide organizer to the run's media sections so pasted-image pages
 * (built-in and custom) appear in the sequence list. Custom slide sections are
 * included even when they have no images yet, so each one is individually
 * movable from the moment it is created.
 */
export function SlideOrganizerCard({ runId }: { runId: string }) {
  const media = useReportMedia(runId);

  const mediaSections = useMemo<OrganizerMediaSection[]>(() => {
    const out: OrganizerMediaSection[] = [];
    for (const slot of media.slots) {
      const isEmpty = slot.images.length === 0;
      // Custom slots always show so each is individually movable before content
      // is added; built-in slots only appear once they have images.
      if (isEmpty && !slot.definition.isCustom) continue;

      const titles = slot.images
        .map((image) => (image.section_title ?? "").trim() || slot.definition.title)
        .filter((title, index, arr) => arr.indexOf(title) === index);

      const existing = out.find((entry) => entry.section === slot.definition.section);
      if (existing) {
        existing.images += slot.images.length;
        for (const title of titles) {
          if (!existing.titles.includes(title)) existing.titles.push(title);
        }
      } else {
        out.push({
          section: slot.definition.section,
          images: slot.images.length,
          titles: titles.length > 0 ? titles : [slot.definition.title],
        });
      }
    }
    return out;
  }, [media.slots]);

  return <SlideOrganizer runId={runId} mediaSections={mediaSections} />;
}
