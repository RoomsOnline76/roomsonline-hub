import { useEffect, useState, useRef } from "react";
import { BANNER_SEGMENTS, BannerSegment } from "@/lib/bannerSegments";

interface CategoryBannerProps {
  onSegmentClick: (segment: BannerSegment) => void;
  heroRef: React.RefObject<HTMLElement>;
}

const CategoryBanner = ({ onSegmentClick, heroRef }: CategoryBannerProps) => {
  const [isSticky, setIsSticky] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (heroRef.current) {
        const heroBottom = heroRef.current.getBoundingClientRect().bottom;
        // When hero bottom goes above viewport (negative), make banner sticky
        setIsSticky(heroBottom <= 0);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [heroRef]);

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
        className="overflow-hidden"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div 
          className={`flex ${isPaused ? "" : "animate-scroll-left"}`}
          style={{ animationPlayState: isPaused ? "paused" : "running" }}
        >
          {duplicatedSegments.map((segment, index) => (
            <button
              key={`${segment.id}-${index}`}
              onClick={() => onSegmentClick(segment)}
              className="flex flex-col items-center px-4 sm:px-6 py-3 min-w-[80px] sm:min-w-[100px] 
                         hover:bg-white/10 transition-colors duration-200 group"
            >
              <segment.icon className="h-4 w-4 sm:h-5 sm:w-5 text-white/80 mb-1 
                                        group-hover:text-white group-hover:scale-110 
                                        transition-all duration-200" />
              <span className="text-[10px] sm:text-xs text-white/80 whitespace-nowrap 
                               group-hover:text-white transition-colors duration-200">
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
