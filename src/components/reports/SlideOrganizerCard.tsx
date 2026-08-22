import { useMemo } from "react";
import { useReportMedia } from "@/hooks/useReportMedia";
import { SlideOrganizer } from "./SlideOrganizer";

/**
 * Wires the slide organizer to the run's media sections so pasted-image pages
 * (built-in and custom) appear in the sequence list.
 */
export function SlideOrganizerCard({ runId }: { runId: string }) {
  const media = useReportMedia(runId);

  const mediaSections = useMemo(() => {
    const out: { section: string; images: number }[] = [];
    for (const slot of media.slots) {
      if (slot.images.length === 0) continue;
      const existing = out.find((entry) => entry.section === slot.definition.section);
      if (existing) existing.images += slot.images.length;
      else out.push({ section: slot.definition.section, images: slot.images.length });
    }
    return out;
  }, [media.slots]);

  return <SlideOrganizer runId={runId} mediaSections={mediaSections} />;
}
