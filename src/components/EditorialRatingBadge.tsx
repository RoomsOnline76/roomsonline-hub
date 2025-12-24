import { Gem, Sparkles, Target, Flame, Heart, Crown, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditorialRatingConfig {
  label: string;
  Icon: LucideIcon;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

const EDITORIAL_RATING_CONFIG: Record<string, EditorialRatingConfig> = {
  a_good_find: {
    label: "A Good Find",
    Icon: Gem,
    bgColor: "bg-emerald-500/10",
    textColor: "text-emerald-700 dark:text-emerald-400",
    borderColor: "border-emerald-500/30",
  },
  quietly_excellent: {
    label: "Quietly Excellent",
    Icon: Sparkles,
    bgColor: "bg-blue-500/10",
    textColor: "text-blue-700 dark:text-blue-400",
    borderColor: "border-blue-500/30",
  },
  exceptionally_considered: {
    label: "Exceptionally Considered",
    Icon: Target,
    bgColor: "bg-purple-500/10",
    textColor: "text-purple-700 dark:text-purple-400",
    borderColor: "border-purple-500/30",
  },
  standout_character: {
    label: "Standout Character",
    Icon: Flame,
    bgColor: "bg-orange-500/10",
    textColor: "text-orange-700 dark:text-orange-400",
    borderColor: "border-orange-500/30",
  },
  truly_special: {
    label: "Truly Special",
    Icon: Heart,
    bgColor: "bg-rose-500/10",
    textColor: "text-rose-700 dark:text-rose-400",
    borderColor: "border-rose-500/30",
  },
  once_in_a_while: {
    label: "Once-in-a-While",
    Icon: Crown,
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

  const { label, Icon, bgColor, textColor, borderColor } = config;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-sm",
        bgColor,
        textColor,
        borderColor,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
