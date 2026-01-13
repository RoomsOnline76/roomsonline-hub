import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';

interface ContinuationPromptProps {
  propertyName: string;
  nights: number;
  onDismiss?: () => void;
  autoDismissMs?: number;
}

export function ContinuationPrompt({ 
  propertyName, 
  nights, 
  onDismiss,
  autoDismissMs = 8000 
}: ContinuationPromptProps) {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (autoDismissMs > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onDismiss?.();
      }, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [autoDismissMs, onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4"
        >
          <div className="bg-card border border-border rounded-xl shadow-lg p-4">
            <div className="flex items-start gap-3">
              {/* Success icon */}
              <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">
                  Added {nights} {nights === 1 ? 'night' : 'nights'} at {propertyName}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Where would you like to go next?
                </p>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/')}
                    className="gap-1"
                  >
                    Browse Properties
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => navigate('/journey/review')}
                  >
                    Complete Journey
                  </Button>
                </div>
              </div>

              {/* Dismiss button */}
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-muted rounded transition-colors flex-shrink-0"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
