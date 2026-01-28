import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PersonalizedSuggestionProps {
  message: string | null;
  className?: string;
  show?: boolean;
}

export function PersonalizedSuggestion({ message, className, show = true }: PersonalizedSuggestionProps) {
  if (!message) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={cn(
            'overflow-hidden',
            className
          )}
        >
          <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg border border-border/50">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground italic">
              {message}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
