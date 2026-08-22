import { ReportMediaSlots } from "@/components/reports/ReportMediaSlots";
import { SpecialReportsCard } from "@/components/reports/SpecialReportsCard";
import type { RunBuilderContext } from "./types";

/** Stage F — screenshots and slides. */
export function StageMedia({ ctx }: { ctx: RunBuilderContext }) {
  return (
    <div className="space-y-4">
      <ReportMediaSlots runId={ctx.runId} sourceType={ctx.run.sourceType} />
      {ctx.ownerSlidesOffered && (
        <SpecialReportsCard
          runId={ctx.runId}
          enabled={ctx.ownerSlidesEnabled}
          onToggle={ctx.onToggleOwnerSlides}
          isToggling={ctx.isTogglingOwnerSlides}
        />
      )}
    </div>
  );
}
