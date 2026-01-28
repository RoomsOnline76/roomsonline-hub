import { cn } from '@/lib/utils';
import { Sparkles, TrendingDown, Clock, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type ValueHintType = 'best_value' | 'popular' | 'limited' | 'discount';

interface ValueHintBadgeProps {
  type: ValueHintType;
  message?: string;
  className?: string;
  show?: boolean;
}

const hintConfig: Record<ValueHintType, { icon: React.ElementType; defaultMessage: string; className: string }> = {
  best_value: {
    icon: TrendingDown,
    defaultMessage: 'Best Value',
    className: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  },
  popular: {
    icon: Users,
    defaultMessage: 'Most Popular',
    className: 'bg-amber-500/10 text-amber-700 border-amber-200',
  },
  limited: {
    icon: Clock,
    defaultMessage: 'Limited Availability',
    className: 'bg-rose-500/10 text-rose-700 border-rose-200',
  },
  discount: {
    icon: Sparkles,
    defaultMessage: 'Special Rate',
    className: 'bg-primary/10 text-primary border-primary/20',
  },
};

export function ValueHintBadge({ type, message, className, show = true }: ValueHintBadgeProps) {
  const config = hintConfig[type];
  const Icon = config.icon;
  const displayMessage = message || config.defaultMessage;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -4 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border',
            config.className,
            className
          )}
        >
          <Icon className="h-3 w-3" />
          <span>{displayMessage}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
