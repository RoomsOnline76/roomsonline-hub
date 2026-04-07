import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { sectionReveal } from '@/lib/motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuildingGalleryProps {
  images: string[];
  propertyName: string;
}

/**
 * Masonry-style photo gallery for building-level images
 * Inspired by fluentliving.com gallery layout
 */
export function BuildingGallery({ images, propertyName }: BuildingGalleryProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!images || images.length <= 1) return null;

  // Show up to 8 images in the grid, with a "+N more" indicator
  const displayImages = images.slice(0, 8);
  const remaining = images.length - 8;

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const nextImage = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % images.length);
    }
  };
  const prevImage = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + images.length) % images.length);
    }
  };

  return (
    <>
      <section
        ref={ref}
        className="runway-section-spacing px-6 sm:px-10 md:px-16 lg:px-20"
      >
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="initial"
            animate={isVisible ? "animate" : "initial"}
            variants={sectionReveal}
          >
            <div className="text-center mb-8">
              <span className="runway-section">Gallery</span>
            </div>

            {/* Asymmetric masonry grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
              {displayImages.map((img, index) => (
                <motion.button
                  key={index}
                  className={cn(
                    "relative overflow-hidden rounded-lg group cursor-pointer",
                    // Make first image larger
                    index === 0 && "col-span-2 row-span-2",
                    // Make 4th image wider on lg
                    index === 3 && "lg:col-span-2"
                  )}
                  style={{ aspectRatio: index === 0 ? '4/3' : '1/1' }}
                  onClick={() => openLightbox(index)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                  transition={{ delay: index * 0.08, duration: 0.5 }}
                >
                  <img
                    src={img}
                    alt={`${propertyName} - ${index + 1}`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                  
                  {/* "+N more" overlay on last visible image */}
                  {index === displayImages.length - 1 && remaining > 0 && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-white text-lg font-medium">+{remaining} more</span>
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
            onClick={closeLightbox}
          >
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white p-2 z-10"
              onClick={closeLightbox}
            >
              <X className="h-6 w-6" />
            </button>
            
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 z-10"
              onClick={(e) => { e.stopPropagation(); prevImage(); }}
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
            
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 z-10"
              onClick={(e) => { e.stopPropagation(); nextImage(); }}
            >
              <ChevronRight className="h-8 w-8" />
            </button>

            <img
              src={images[lightboxIndex]}
              alt={`${propertyName} - ${lightboxIndex + 1}`}
              className="max-w-[90vw] max-h-[85vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
              {lightboxIndex + 1} / {images.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
