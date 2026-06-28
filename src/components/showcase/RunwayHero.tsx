import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { heroTitleReveal, taglineFade } from '@/lib/motion';
import { ChevronLeft, ChevronRight, MapPin, Images } from 'lucide-react';
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
  propertyType?: string;
  onShowAllPhotos?: () => void;
}

/**
 * Format the descriptive heading combining name, type, and location.
 * Renders "{name} — {type} in {city}" when context is available.
 */
function composeHeading(name: string, propertyType?: string, city?: string): string {
  const parts: string[] = [];
  if (propertyType) parts.push(propertyType);
  if (city) parts.push(`in ${city}`);
  return parts.length ? `${name} — ${parts.join(" ")}` : name;
}

/**
 * FluentLiving-inspired hero: 1+4 image grid on desktop, swipeable carousel on mobile.
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
  propertyType,
  onShowAllPhotos,
}: RunwayHeroProps) {
  const headingText = composeHeading(name, propertyType, city);
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

  // Auto-rotate on mobile only
  useEffect(() => {
    if (!images || images.length <= 1 || videoUrl) return;
    // Only auto-rotate when there's no grid (mobile)
    const mql = window.matchMedia('(min-width: 768px)');
    if (mql.matches) return; // desktop uses grid, no auto-rotate
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

  const gridImages = images?.slice(0, 5) || [];
  const hasExtraImages = imageCount > 5;

  return (
    <>
      {/* ===== MOBILE: Swipeable carousel (unchanged UX) ===== */}
      <section
        className="relative h-[55vh] sm:h-[60vh] md:hidden overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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
                transition={{ duration: 0.8, ease: 'easeInOut' }}
                className="absolute inset-0 w-full h-full object-cover"
              />
            </AnimatePresence>
          ) : (
            <div className="absolute inset-0 bg-muted" style={{ background: gradientFallback }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        </div>

        {/* Dot indicators */}
        {imageCount > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
            {images!.slice(0, 8).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentImageIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === currentImageIndex
                    ? "bg-white w-5"
                    : "bg-white/50 w-1.5"
                )}
                aria-label={`Go to image ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Mobile content overlay */}
        <div className="absolute bottom-0 left-0 right-0 z-10 p-5 pb-8">
          <div className="max-w-4xl">
            {(city || country) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="flex items-center gap-1.5 mb-2"
              >
                <MapPin className="h-3 w-3 text-white/70" />
                <span className="text-xs text-white/70 tracking-wide">
                  {[city, country].filter(Boolean).join(', ')}
                </span>
              </motion.div>
            )}

            <motion.h1
              {...heroTitleReveal}
              className="font-serif text-2xl sm:text-3xl font-light tracking-tight text-white leading-[1.1] mb-2"
            >
              {name}
            </motion.h1>

            <motion.p
              {...taglineFade}
              className="text-sm text-white/70 font-light max-w-xl line-clamp-2"
            >
              {tagline}
            </motion.p>

            {lowestRate && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                className="mt-3 inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20"
              >
                <span className="text-[10px] text-white/60 uppercase tracking-wider">From</span>
                <span className="text-base font-semibold text-white">
                  <FormattedPrice amount={lowestRate} />
                </span>
                <span className="text-[10px] text-white/60">/ night</span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Back button */}
        <div className="absolute top-0 left-0 right-0 z-20 p-3">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-background/20 backdrop-blur-sm text-white text-xs hover:bg-background/30 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      {/* ===== DESKTOP: FluentLiving 1+4 Grid ===== */}
      <section className="hidden md:block">
        {/* Back button above gallery */}
        <div className="container mx-auto px-4 pt-4 pb-2">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
        </div>

        {/* Image Grid */}
        <div className="container mx-auto px-4">
          <div className="rounded-2xl overflow-hidden">
            {videoUrl ? (
              <div className="relative h-[450px] lg:h-[500px]">
                <video autoPlay muted loop playsInline className="w-full h-full object-cover">
                  <source src={videoUrl} type="video/mp4" />
                </video>
              </div>
            ) : gridImages.length >= 5 ? (
              <div className="grid grid-cols-4 grid-rows-2 gap-1.5 h-[420px] lg:h-[480px]">
                {/* Main large image — spans 2 cols, 2 rows */}
                <div className="col-span-2 row-span-2 relative group cursor-pointer" onClick={onShowAllPhotos}>
                  <img
                    src={gridImages[0]}
                    alt={`${name} - main`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    loading="eager"
                  />
                </div>
                {/* 4 smaller images */}
                {gridImages.slice(1, 5).map((img, i) => (
                  <div
                    key={i}
                    className={cn(
                      "relative group cursor-pointer overflow-hidden",
                      i === 3 && hasExtraImages && "relative"
                    )}
                    onClick={onShowAllPhotos}
                  >
                    <img
                      src={img}
                      alt={`${name} - ${i + 2}`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                    {/* "+N more" overlay on the last image */}
                    {i === 3 && hasExtraImages && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center transition-colors group-hover:bg-black/50">
                        <div className="flex items-center gap-2 text-white">
                          <Images className="h-5 w-5" />
                          <span className="text-sm font-medium">+{imageCount - 5} more</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : gridImages.length > 0 ? (
              /* Fewer than 5 images — simple 1+N layout */
              <div className={cn(
                "grid gap-1.5 h-[420px] lg:h-[480px]",
                gridImages.length === 1 ? "grid-cols-1" :
                gridImages.length === 2 ? "grid-cols-2" :
                "grid-cols-4 grid-rows-2"
              )}>
                <div className={cn(
                  "relative cursor-pointer",
                  gridImages.length >= 3 ? "col-span-2 row-span-2" : ""
                )} onClick={onShowAllPhotos}>
                  <img
                    src={gridImages[0]}
                    alt={`${name} - main`}
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                </div>
                {gridImages.slice(1).map((img, i) => (
                  <div key={i} className="relative cursor-pointer" onClick={onShowAllPhotos}>
                    <img
                      src={img}
                      alt={`${name} - ${i + 2}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[420px] bg-muted rounded-2xl" style={{ background: gradientFallback }} />
            )}
          </div>

          {/* "Show all photos" button */}
          {imageCount > 5 && onShowAllPhotos && (
            <div className="flex justify-end mt-2">
              <button
                onClick={onShowAllPhotos}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Images className="h-4 w-4" />
                <span>Show all {imageCount} photos</span>
              </button>
            </div>
          )}
        </div>

        {/* Property info below gallery */}
        <div className="container mx-auto px-4 pt-6 pb-2">
          {(city || country) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="flex items-center gap-1.5 mb-1"
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {[city, country].filter(Boolean).join(', ')}
              </span>
            </motion.div>
          )}

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="font-serif text-3xl lg:text-4xl font-light tracking-tight text-foreground leading-[1.15] mb-2"
          >
            {name}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            className="text-base text-muted-foreground font-light max-w-2xl"
          >
            {tagline}
          </motion.p>
        </div>
      </section>
    </>
  );
}
