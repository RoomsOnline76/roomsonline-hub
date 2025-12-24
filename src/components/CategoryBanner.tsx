import { useEffect, useState, useRef, useCallback } from "react";
import { BANNER_SEGMENTS, BannerSegment } from "@/lib/bannerSegments";

interface CategoryBannerProps {
  onSegmentClick: (segment: BannerSegment) => void;
  heroRef: React.RefObject<HTMLElement>;
}

const CategoryBanner = ({ onSegmentClick, heroRef }: CategoryBannerProps) => {
  const [isSticky, setIsSticky] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const scrollPositionRef = useRef(0);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);
  const lastTimeRef = useRef(0);
  const scrollSpeed = 50; // pixels per second

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

  // Duplicate segments for seamless infinite scroll
  const duplicatedSegments = [...BANNER_SEGMENTS, ...BANNER_SEGMENTS];

  return (
    <div
      ref={bannerRef}
      className={`
        z-40 bg-black/70 backdrop-blur-sm transition-all duration-300
        ${isSticky 
          ? "fixed top-0 left-0 right-0 shadow-lg" 
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
              className="flex flex-col items-center px-4 sm:px-6 py-3 min-w-[80px] sm:min-w-[100px] 
                         hover:bg-white/10 transition-colors duration-200 group"
            >
              <segment.icon className="h-4 w-4 sm:h-5 sm:w-5 text-white/80 mb-1 
                                        group-hover:text-white group-hover:scale-110 
                                        transition-all duration-200 pointer-events-none" />
              <span className="text-[10px] sm:text-xs text-white/80 whitespace-nowrap 
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
