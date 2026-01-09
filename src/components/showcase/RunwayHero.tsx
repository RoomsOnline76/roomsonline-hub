import { motion } from 'framer-motion';
import { useParallax } from '@/hooks/useScrollReveal';
import { heroTitleReveal, taglineFade, imageReveal } from '@/lib/motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RunwayHeroProps {
  name: string;
  tagline: string;
  images?: string[];
  videoUrl?: string | null;
  gradientFallback?: string;
  onScrollDown?: () => void;
}

/**
 * Act I: The Reveal
 * Full-viewport hero with runway-inspired entrance
 */
export function RunwayHero({
  name,
  tagline,
  images,
  videoUrl,
  gradientFallback,
  onScrollDown,
}: RunwayHeroProps) {
  const { ref: parallaxRef, offset } = useParallax(0.3);

  const hasMedia = videoUrl || (images && images.length > 0);

  return (
    <section className="runway-hero" ref={parallaxRef}>
      {/* Background Media Layer */}
      <div className="absolute inset-0 overflow-hidden">
        {videoUrl ? (
          <motion.video
            {...imageReveal}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: `translateY(${offset}px)` }}
          >
            <source src={videoUrl} type="video/mp4" />
          </motion.video>
        ) : images && images.length > 0 ? (
          <motion.img
            {...imageReveal}
            src={images[0]}
            alt={name}
            className="w-full h-full object-cover"
            style={{ transform: `translateY(${offset}px) scale(1.05)` }}
          />
        ) : (
          <div 
            className="runway-gradient-map"
            style={{ background: gradientFallback }}
          />
        )}

        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/30 to-transparent" />
      </div>

      {/* Content Layer */}
      <div className="relative z-10 p-6 sm:p-10 md:p-16 lg:p-20 pb-16 sm:pb-20 md:pb-24">
        <div className="max-w-5xl">
          {/* Property Name */}
          <motion.h1
            {...heroTitleReveal}
            className="runway-title text-foreground mb-4 sm:mb-6"
          >
            {name}
          </motion.h1>

          {/* Tagline */}
          <motion.p
            {...taglineFade}
            className="runway-tagline max-w-2xl"
          >
            {tagline}
          </motion.p>

          {/* Subtle Book Suggestion */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.6 }}
            className="mt-8 sm:mt-12"
          >
            <span className="runway-section text-foreground/50">
              Book Your Escape
            </span>
          </motion.div>
        </div>
      </div>

      {/* Scroll Indicator */}
      {onScrollDown && (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.5 }}
          onClick={onScrollDown}
          className={cn(
            "absolute bottom-8 left-1/2 -translate-x-1/2",
            "flex flex-col items-center gap-2 text-foreground/50",
            "transition-colors hover:text-foreground"
          )}
          aria-label="Scroll to explore"
        >
          <span className="runway-section">Explore</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown className="h-5 w-5" />
          </motion.div>
        </motion.button>
      )}
    </section>
  );
}
