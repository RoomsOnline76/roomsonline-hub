import { SlideOrganizerCard } from "@/components/reports/SlideOrganizerCard";
import type { RunBuilderContext } from "./types";

/** Stage G — shuffle the pages and images into the final order. */
export function StageOrganize({ ctx }: { ctx: RunBuilderContext }) {
  return <SlideOrganizerCard runId={ctx.runId} sourceType={ctx.run.sourceType} />;
}
