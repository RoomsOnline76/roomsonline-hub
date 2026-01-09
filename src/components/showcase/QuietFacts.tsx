import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { sectionReveal } from '@/lib/motion';

interface QuietFactsProps {
  facts: string[];
  editorialBlurb?: string | null;
}

/**
 * Act II: The Quiet Facts
 * Core information woven into editorial sentences
 */
export function QuietFacts({ facts, editorialBlurb }: QuietFactsProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.3 });

  if (facts.length === 0 && !editorialBlurb) return null;

  return (
    <section 
      ref={ref}
      className="runway-section-spacing px-6 sm:px-10 md:px-16 lg:px-20"
    >
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial="initial"
          animate={isVisible ? "animate" : "initial"}
          variants={sectionReveal}
          className="space-y-6 sm:space-y-8"
        >
          {/* Editorial Facts as Prose */}
          {facts.map((fact, index) => (
            <motion.p
              key={index}
              variants={sectionReveal}
              className="runway-facts text-center"
              style={{ transitionDelay: `${index * 150}ms` }}
            >
              {fact}
            </motion.p>
          ))}

          {/* Editorial Blurb */}
          {editorialBlurb && (
            <motion.div
              variants={sectionReveal}
              className="pt-6 sm:pt-8 border-t border-border/30"
            >
              <p className="runway-prose text-center runway-prose-width mx-auto">
                {editorialBlurb}
              </p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
