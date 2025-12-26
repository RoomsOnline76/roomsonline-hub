import React, { useMemo } from 'react';
import { Sparkles, X, Lightbulb } from 'lucide-react';
import { useAISearch } from '@/contexts/AISearchContext';

// Carike's personalized intro phrases - slightly randomized
const CARIKE_INTROS = [
  "I found something special for you...",
  "Here's my pick just for you...",
  "I think you'll love this...",
  "This one caught my eye for you...",
  "Let me show you what I found...",
  "I have just the place in mind...",
];

export function AIExplanationOverlay() {
  const { aiExplanation, aiQuery, isAISearchActive, resetAISearch, aiResults } = useAISearch();

  // Pick a random intro phrase (stable per render cycle)
  const carikeIntro = useMemo(() => {
    return CARIKE_INTROS[Math.floor(Math.random() * CARIKE_INTROS.length)];
  }, [aiExplanation]);

  if (!isAISearchActive || !aiExplanation) return null;

  return (
    <div className="absolute left-6 md:left-12 top-1/2 -translate-y-1/2 z-20 max-w-md animate-fade-in">
      {/* Frosted glass card */}
      <div className="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 shadow-2xl">
        {/* Close button */}
        <button
          onClick={resetAISearch}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="Close AI results"
        >
          <X className="h-4 w-4 text-white" />
        </button>

        {/* Carike's personalized intro */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/30 border border-primary/40">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            <span className="text-xs font-medium text-primary-foreground">Carike</span>
          </div>
        </div>

        {/* Carike's intro phrase */}
        <p className="text-sm font-medium text-white mb-2">{carikeIntro}</p>

        {/* Query echo */}
        <p className="text-xs text-white/60 mb-2 italic">"{aiQuery}"</p>

        {/* AI Explanation */}
        <p className="text-sm sm:text-base text-white leading-relaxed">
          {aiExplanation}
        </p>

        {/* Alternative options hint when multiple matches */}
        {aiResults && aiResults.length > 1 && (
          <div className="mt-3 flex items-start gap-2 bg-white/10 rounded-lg px-3 py-2">
            <Lightbulb className="h-4 w-4 text-yellow-300 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-white/80">
              Found {aiResults.length} options that match! Scroll down to explore alternatives.
            </p>
          </div>
        )}

        {/* Hint to scroll */}
        <p className="mt-4 text-xs text-white/50">
          ↓ Scroll down to see your matches
        </p>
      </div>

      {/* Decorative glow */}
      <div className="absolute inset-0 -z-10 rounded-2xl bg-primary/30 blur-2xl opacity-40" />
    </div>
  );
}
