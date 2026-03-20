import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { heroTitleReveal, taglineFade } from '@/lib/motion';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FormattedPrice } from '@/components/FormattedPrice';

interface RunwayHeroProps {
  name: string;
  tagline: string;
  images?: string[];
  videoUrl?: string | null;
  gradientFallback?: string;
  onScrollDown?: () => void;
  lowestRate?: number | null;
  city?: string;
  country?: string;
}

/**
 * Fluent-inspired hero: full-width image gallery with clean overlay.
 * Mobile: swipeable gallery, compact text. Desktop: auto-rotate + arrow nav.
 */
export function RunwayHero({
  name,
  tagline,
  images,
  videoUrl,
  gradientFallback,
  onScrollDown,
  lowestRate,
  city,
  country,
}: RunwayHeroProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const imageCount = images?.length || 0;

  // Touch/swipe handling for mobile
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (Math.abs(touchDeltaX.current) > 50 && imageCount > 1) {
      if (touchDeltaX.current < 0) {
        setCurrentImageIndex((prev) => (prev + 1) % imageCount);
      } else {
        setCurrentImageIndex((prev) => (prev - 1 + imageCount) % imageCount);
      }
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
  }, [imageCount]);

  // Auto-rotate (desktop only — pauses when touch is active)
  useEffect(() => {
    if (!images || images.length <= 1 || videoUrl) return;
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [images, videoUrl]);

  const goNext = useCallback(() => {
    if (imageCount > 1) setCurrentImageIndex((prev) => (prev + 1) % imageCount);
  }, [imageCount]);

  const goPrev = useCallback(() => {
    if (imageCount > 1) setCurrentImageIndex((prev) => (prev - 1 + imageCount) % imageCount);
  }, [imageCount]);

  return (
    <section
      className="relative h-[55vh] sm:h-[65vh] lg:h-[80vh] overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background Media */}
      <div className="absolute inset-0">
        {videoUrl ? (
          <video autoPlay muted loop playsInline className="w-full h-full object-cover">
            <source src={videoUrl} type="video/mp4" />
          </video>
        ) : images && images.length > 0 ? (
          <AnimatePresence mode="wait">
            <motion.img
              key={currentImageIndex}
              src={images[currentImageIndex]}
              alt={`${name} - ${currentImageIndex + 1}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, ease: 'easeInOut' }}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </AnimatePresence>
        ) : (
          <div className="absolute inset-0 bg-muted" style={{ background: gradientFallback }} />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />
      </div>

      {/* Arrow navigation — hidden on mobile (swipe instead) */}
      {imageCount > 1 && (
        <>
          <button
            onClick={goPrev}
            className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-background/30 backdrop-blur-sm text-white hover:bg-background/50 transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={goNext}
            className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-background/30 backdrop-blur-sm text-white hover:bg-background/50 transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
            {images!.slice(0, 8).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentImageIndex(i)}
                className={cn(
                  "h-1.5 sm:h-2 rounded-full transition-all duration-300",
                  i === currentImageIndex
                    ? "bg-white w-5 sm:w-6"
                    : "bg-white/50 hover:bg-white/75 w-1.5 sm:w-2"
                )}
                aria-label={`Go to image ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-5 sm:p-10 lg:p-14 pb-8 sm:pb-10">
        <div className="max-w-4xl">
          {/* Location */}
          {(city || country) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="flex items-center gap-1.5 mb-2 sm:mb-3"
            >
              <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white/70" />
              <span className="text-xs sm:text-sm text-white/70 tracking-wide">
                {[city, country].filter(Boolean).join(', ')}
              </span>
            </motion.div>
          )}

          {/* Property Name */}
          <motion.h1
            {...heroTitleReveal}
            className="font-serif text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-light tracking-tight text-white leading-[1.1] mb-2 sm:mb-3"
          >
            {name}
          </motion.h1>

          {/* Tagline — truncated on mobile */}
          <motion.p
            {...taglineFade}
            className="text-sm sm:text-base sm:text-lg text-white/70 font-light max-w-xl line-clamp-2 sm:line-clamp-none"
          >
            {tagline}
          </motion.p>

          {/* Price Badge */}
          {lowestRate && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="mt-3 sm:mt-4 inline-flex items-baseline gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20"
            >
              <span className="text-[10px] sm:text-xs text-white/60 uppercase tracking-wider">From</span>
              <span className="text-base sm:text-lg font-semibold text-white">
                <FormattedPrice amount={lowestRate} />
              </span>
              <span className="text-[10px] sm:text-xs text-white/60">/ night</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Back button */}
      <div className="absolute top-0 left-0 right-0 z-20 p-3 sm:p-6">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-background/20 backdrop-blur-sm text-white text-xs sm:text-sm hover:bg-background/30 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Back</span>
        </button>
      </div>
    </section>
  );
}
