import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RUN_BUILD_STAGES,
  STAGE_META,
  type RunBuildStage,
  type StageCompletion,
} from "@/lib/runBuildStages";

interface Props {
  stage: RunBuildStage;
  completion: StageCompletion;
  onSelect: (stage: RunBuildStage) => void;
}

/** Horizontal A–H stepper. Any stage can be revisited; nothing is destructive. */
export function StageRail({ stage, completion, onSelect }: Props) {
  return (
    <nav aria-label="Report build stages" className="overflow-x-auto">
      <ol className="flex items-stretch gap-1.5 min-w-max pb-1">
        {RUN_BUILD_STAGES.map((key) => {
          const meta = STAGE_META[key];
          const active = key === stage;
          const done = completion[key];
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
                    active
                      ? "bg-primary-foreground text-primary"
                      : done
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {done && !active ? <Check className="h-3 w-3" /> : meta.letter}
                </span>
                <span className="text-xs font-medium whitespace-nowrap">{meta.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
