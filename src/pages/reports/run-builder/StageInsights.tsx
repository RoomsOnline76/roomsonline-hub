import { ManualInputsCard } from "@/components/reports/ManualInputsCard";
import { AiInsightsPanel } from "@/components/reports/AiInsightsPanel";
import { Page2Card } from "@/components/reports/page2/Page2Card";
import { Card, CardContent } from "@/components/ui/card";
import type { RunBuilderContext } from "./types";

/**
 * Stage I — TOBI's analysis and the reviewer's narrative: minimum stay,
 * promotions, rate overrides and commentary.
 */
export function StageInsights({ ctx }: { ctx: RunBuilderContext }) {
  const { snapshot } = ctx;

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Process the run in the review step first — TOBI reads the aggregated figures.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <AiInsightsPanel runId={ctx.runId} months={snapshot.months} />
      <ManualInputsCard
        runId={ctx.runId}
        sourceType={ctx.run.sourceType}
        months={snapshot.months}
        otbRevenue={snapshot.otbRevenue}
        sections="narrative"
      />
    </div>
  );
}
