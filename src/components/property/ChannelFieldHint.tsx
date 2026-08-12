import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChannelFieldFeedback } from "@/lib/channelFieldRules";

interface ChannelFieldHintProps {
  feedback: ChannelFieldFeedback;
  /** Hide the requirement line once the field passes (keeps dense forms calm). */
  compact?: boolean;
  className?: string;
}

/**
 * Inline constraint helper for channel-mandatory inputs: always states the rule,
 * and turns amber/red with the exact problem while the value is non-compliant.
 */
export function ChannelFieldHint({ feedback, compact = true, className }: ChannelFieldHintProps) {
  const { status, requirement, issue } = feedback;

  if (status === "ok") {
    if (compact) {
      return (
        <p className={cn("flex items-center gap-1 text-[10px] text-success", className)}>
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          Meets channel requirements
        </p>
      );
    }
    return (
      <p className={cn("flex items-start gap-1 text-[10px] text-success", className)}>
        <CheckCircle2 className="mt-[1px] h-3 w-3 shrink-0" />
        <span>{requirement}</span>
      </p>
    );
  }

  const isProblem = status === "error" || status === "warn";
  const tone = status === "error" ? "text-destructive" : status === "warn" ? "text-warning" : "text-muted-foreground";
  const Icon = isProblem ? AlertTriangle : Info;

  return (
    <p className={cn("flex items-start gap-1 text-[10px] leading-snug", tone, className)}>
      <Icon className="mt-[1px] h-3 w-3 shrink-0" />
      <span>{issue ? `${issue} ${requirement}` : requirement}</span>
    </p>
  );
}

export default ChannelFieldHint;
