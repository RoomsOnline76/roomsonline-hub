import { BaselineCard } from "@/components/reports/BaselineCard";
import type { RunBuilderContext } from "./types";

/** Stage E — which earlier run supplies the comparison columns. */
export function StageBaseline({ ctx }: { ctx: RunBuilderContext }) {
  return <BaselineCard run={ctx.run} onChanged={ctx.refresh} />;
}
