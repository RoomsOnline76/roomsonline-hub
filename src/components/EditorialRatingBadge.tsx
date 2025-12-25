import { Gem, Sparkles, Target, Flame, Heart, Crown, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface EditorialRatingConfig {
  label: string;
  description: string;
  Icon: LucideIcon;
  iconColor: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

export const EDITORIAL_RATING_CONFIG: Record<string, EditorialRatingConfig> = {
  a_good_find: {
    label: "A Good Find",
    description: "Solid, dependable, and honestly enjoyable. Not trying to be flashy — just a place that does what it promises, well.",
    Icon: Gem,
    iconColor: "text-emerald-600",
    bgColor: "bg-emerald-500/10",
    textColor: "text-emerald-700 dark:text-emerald-400",
    borderColor: "border-emerald-500/30",
  },
  quietly_excellent: {
    label: "Quietly Excellent",
    description: "Nothing screams for attention… and that's the point. Thoughtful details, calm confidence, and a stay that lingers longer than expected.",
    Icon: Sparkles,
    iconColor: "text-blue-600",
    bgColor: "bg-blue-500/10",
    textColor: "text-blue-700 dark:text-blue-400",
    borderColor: "border-blue-500/30",
  },
  exceptionally_considered: {
    label: "Exceptionally Considered",
    description: "Every choice feels intentional — from layout to location to atmosphere. This is where good taste and good judgement quietly meet.",
    Icon: Target,
    iconColor: "text-purple-600",
    bgColor: "bg-purple-500/10",
    textColor: "text-purple-700 dark:text-purple-400",
    borderColor: "border-purple-500/30",
  },
  standout_character: {
    label: "Standout Character",
    description: "A place with a point of view. You don't forget it easily, and you wouldn't confuse it with anywhere else.",
    Icon: Flame,
    iconColor: "text-orange-600",
    bgColor: "bg-orange-500/10",
    textColor: "text-orange-700 dark:text-orange-400",
    borderColor: "border-orange-500/30",
  },
  truly_special: {
    label: "Truly Special",
    description: "Rare. Memorable. Emotionally sticky. The kind of stay people bring up months later, unprompted.",
    Icon: Heart,
    iconColor: "text-rose-600",
    bgColor: "bg-rose-500/10",
    textColor: "text-rose-700 dark:text-rose-400",
    borderColor: "border-rose-500/30",
  },
  once_in_a_while: {
    label: "Once-in-a-While",
    description: "Not perfect for everyone — and that's exactly why it's here. A genuinely exceptional place that earns its reputation by being unapologetically itself.",
    Icon: Crown,
    iconColor: "text-amber-600",
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-700 dark:text-amber-400",
    borderColor: "border-amber-500/30",
  },
};

interface EditorialRatingBadgeProps {
  rating: string | null | undefined;
  className?: string;
}

export function EditorialRatingBadge({ rating, className }: EditorialRatingBadgeProps) {
  if (!rating) return null;

  const config = EDITORIAL_RATING_CONFIG[rating];
  if (!config) return null;

  const { label, description, Icon, iconColor } = config;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200/80 backdrop-blur-sm cursor-help",
            className
          )}
        >
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        <p className="font-semibold mb-1">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
