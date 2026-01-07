// Category banner component with search filtering support
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { BANNER_SEGMENTS, BannerSegment } from "@/lib/bannerSegments";
import { SEGMENT_FILTERS, SegmentFilterId } from "@/lib/segmentFilters";
import { supabase } from "@/integrations/supabase/client";
import { PropertySearchResult } from "@/contexts/SearchContext";

interface CategoryBannerProps {
  onSegmentClick: (segment: BannerSegment) => void;
  heroRef: React.RefObject<HTMLElement>;
  selectedProperty?: PropertySearchResult | null;
}

const CategoryBanner = ({ onSegmentClick, heroRef, selectedProperty }: CategoryBannerProps) => {
  const [isSticky, setIsSticky] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [propertyTags, setPropertyTags] = useState<string[]>([]);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );
  const bannerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const scrollPositionRef = useRef(0);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);
  const lastTimeRef = useRef(0);
  const scrollSpeed = 50; // pixels per second

  // Track viewport width for dynamic segment sizing
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch all unique navigation tags from properties
  useEffect(() => {
    const fetchPropertyTags = async () => {
      const { data } = await supabase
        .from("public_properties")
        .select("navigation_tags")
        .not("navigation_tags", "is", null);
      
      if (data) {
        const allTags = new Set<string>();
        data.forEach(p => {
          if (Array.isArray(p.navigation_tags)) {
            p.navigation_tags.forEach(tag => allTags.add(tag));
          }
        });
        setPropertyTags(Array.from(allTags));
      }
    };
    fetchPropertyTags();
  }, []);

  // Filter segments that have at least one property with matching tags
  const visibleSegments = useMemo(() => {
    // If a property is selected, only show its navigation tags
    if (selectedProperty?.navigation_tags && selectedProperty.navigation_tags.length > 0) {
      return BANNER_SEGMENTS.filter(segment => {
        if (segment.filterType === null) return true; // Always show "ALL"
        const segmentConfig = SEGMENT_FILTERS[segment.filterType as SegmentFilterId];
        if (!segmentConfig) return false;
        return segmentConfig.tags.some(tag => selectedProperty.navigation_tags?.includes(tag));
      });
    }
    
    if (propertyTags.length === 0) return BANNER_SEGMENTS; // Show all while loading
    
    return BANNER_SEGMENTS.filter(segment => {
      // Always show "ALL" segment
      if (segment.filterType === null) return true;
      
      // Check if this segment has any matching properties
      const segmentConfig = SEGMENT_FILTERS[segment.filterType as SegmentFilterId];
      if (!segmentConfig) return false;
      
      return segmentConfig.tags.some(tag => propertyTags.includes(tag));
    });
  }, [propertyTags, selectedProperty]);

  // Calculate dynamic segment width to ensure banner is always full
  // The duplicated segments need to fill the viewport width together
  const segmentMinWidth = useMemo(() => {
    const segmentCount = visibleSegments.length;
    if (segmentCount === 0) return 100;
    
    // We duplicate segments, so total segments = segmentCount * 2
    // Each set should fill at least the viewport width for seamless scrolling
    // So each segment needs: viewportWidth / segmentCount
    const minWidthNeeded = viewportWidth / segmentCount;
    
    // Dynamic max based on segment count: fewer segments = allow wider
    // This ensures 2-3 segments fill the screen properly
    const maxWidth = segmentCount <= 2 ? 400 
                   : segmentCount <= 3 ? 300 
                   : segmentCount <= 5 ? 220 
                   : 180;
    
    // Mobile: 80px min, Desktop: 100px min
    const minBound = viewportWidth < 640 ? 80 : 100;
    
    return Math.max(minBound, Math.min(maxWidth, Math.ceil(minWidthNeeded)));
  }, [visibleSegments.length, viewportWidth]);

  useEffect(() => {
    const handleScroll = () => {
      if (heroRef.current) {
        const heroBottom = heroRef.current.getBoundingClientRect().bottom;
        setIsSticky(heroBottom <= 0);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [heroRef]);

  // Auto-scroll animation
  const animate = useCallback((timestamp: number) => {
    if (!scrollRef.current) return;
    
    if (!lastTimeRef.current) {
      lastTimeRef.current = timestamp;
    }
    
    const deltaTime = (timestamp - lastTimeRef.current) / 1000; // Convert to seconds
    lastTimeRef.current = timestamp;
    
    if (!isDragging && !isPaused) {
      scrollPositionRef.current += scrollSpeed * deltaTime;
      
      // Reset position for seamless loop (half the content width)
      const halfWidth = scrollRef.current.scrollWidth / 2;
      if (scrollPositionRef.current >= halfWidth) {
        scrollPositionRef.current -= halfWidth;
      }
      
      scrollRef.current.style.transform = `translateX(-${scrollPositionRef.current}px)`;
    }
    
    animationRef.current = requestAnimationFrame(animate);
  }, [isDragging, isPaused]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animate]);

  // Drag handlers
  const handleDragStart = (clientX: number) => {
    setIsDragging(true);
    dragStartXRef.current = clientX;
    dragStartScrollRef.current = scrollPositionRef.current;
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging) return;
    
    const deltaX = dragStartXRef.current - clientX;
    let newPosition = dragStartScrollRef.current + deltaX;
    
    // Handle wrapping during drag
    const halfWidth = scrollRef.current ? scrollRef.current.scrollWidth / 2 : 0;
    if (halfWidth > 0) {
      while (newPosition < 0) newPosition += halfWidth;
      while (newPosition >= halfWidth) newPosition -= halfWidth;
    }
    
    scrollPositionRef.current = newPosition;
    
    if (scrollRef.current) {
      scrollRef.current.style.transform = `translateX(-${scrollPositionRef.current}px)`;
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    lastTimeRef.current = 0; // Reset time for smooth animation resume
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientX);
  };

  const handleMouseUp = () => {
    handleDragEnd();
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      handleDragEnd();
    }
    setIsPaused(false);
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Duplicate visible segments for seamless infinite scroll
  const duplicatedSegments = [...visibleSegments, ...visibleSegments];

  return (
    <div
      ref={bannerRef}
      className={`
        z-40 bg-black/70 backdrop-blur-sm transition-all duration-300
        ${isSticky 
          ? "fixed top-0 left-0 right-0 shadow-lg border-b border-white/10" 
          : "absolute bottom-0 left-0 right-0"
        }
      `}
    >
      <div 
        className="overflow-hidden cursor-grab active:cursor-grabbing select-none"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
          ref={scrollRef}
          className="flex"
          style={{ willChange: "transform" }}
        >
          {duplicatedSegments.map((segment, index) => (
            <button
              key={`${segment.id}-${index}`}
              onClick={() => !isDragging && onSegmentClick(segment)}
              className="flex flex-col items-center py-3 flex-shrink-0
                         hover:bg-white/10 transition-colors duration-200 group"
              style={{ 
                minWidth: `${segmentMinWidth}px`,
                paddingLeft: '1rem',
                paddingRight: '1rem'
              }}
            >
              <segment.icon className="h-4 w-4 sm:h-5 sm:w-5 text-white/80 mb-1 
                                        group-hover:text-white group-hover:scale-110 
                                        transition-all duration-200 pointer-events-none" />
              <span className="text-[10px] sm:text-xs text-white/80 whitespace-nowrap tracking-wide
                               group-hover:text-white transition-colors duration-200 pointer-events-none">
                {segment.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CategoryBanner;
