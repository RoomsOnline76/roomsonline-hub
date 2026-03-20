import { useState, useEffect, useCallback } from 'react';
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
 * Fluent-inspired hero: full-width image gallery with clean overlay
 * No parallax, just elegant crossfade + property info + price badge
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

  // Auto-rotate images every 5 seconds
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
    <section className="relative h-[70vh] sm:h-[75vh] lg:h-[80vh] overflow-hidden">
      {/* Background Media */}
      <div className="absolute inset-0">
        {videoUrl ? (
          <video
            autoPlay muted loop playsInline
            className="w-full h-full object-cover"
          >
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
          <div
            className="absolute inset-0 bg-muted"
            style={{ background: gradientFallback }}
          />
        )}

        {/* Single gradient overlay - bottom heavy for text */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />
      </div>

      {/* Image navigation arrows */}
      {imageCount > 1 && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-background/30 backdrop-blur-sm text-white hover:bg-background/50 transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={goNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-background/30 backdrop-blur-sm text-white hover:bg-background/50 transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
            {images!.slice(0, 8).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentImageIndex(i)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all duration-300",
                  i === currentImageIndex
                    ? "bg-white w-6"
                    : "bg-white/50 hover:bg-white/75"
                )}
                aria-label={`Go to image ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {/* Content overlay - bottom left */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-6 sm:p-10 lg:p-14">
        <div className="max-w-4xl">
          {/* Location */}
          {(city || country) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="flex items-center gap-1.5 mb-3"
            >
              <MapPin className="h-3.5 w-3.5 text-white/70" />
              <span className="text-sm text-white/70 tracking-wide">
                {[city, country].filter(Boolean).join(', ')}
              </span>
            </motion.div>
          )}

          {/* Property Name */}
          <motion.h1
            {...heroTitleReveal}
            className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light tracking-tight text-white leading-[1.1] mb-3"
          >
            {name}
          </motion.h1>

          {/* Tagline */}
          <motion.p
            {...taglineFade}
            className="text-base sm:text-lg text-white/70 font-light max-w-xl"
          >
            {tagline}
          </motion.p>

          {/* Price Badge */}
          {lowestRate && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="mt-4 inline-flex items-baseline gap-1.5 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20"
            >
              <span className="text-xs text-white/60 uppercase tracking-wider">From</span>
              <span className="text-lg sm:text-xl font-semibold text-white">
                <FormattedPrice amount={lowestRate} />
              </span>
              <span className="text-xs text-white/60">/ night</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Back button area - top left */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 sm:p-6">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-background/20 backdrop-blur-sm text-white text-sm hover:bg-background/30 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </button>
      </div>
    </section>
  );
}
