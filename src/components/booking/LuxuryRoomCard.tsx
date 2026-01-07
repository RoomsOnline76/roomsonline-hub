import { useState } from "react";
import { ChevronDown, ChevronUp, Users, Bed, Bath, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormattedPrice } from "@/components/FormattedPrice";
import { cn } from "@/lib/utils";
import { formatBedConfiguration, hasBedConfiguration } from "@/lib/bedConfig";
import { motion, AnimatePresence } from "framer-motion";

interface LuxuryRoomCardProps {
  room: {
    id: string;
    name: string;
    description?: string;
    images?: string[];
    maxPeople?: number;
    maxAdults?: number;
    maxChildren?: number;
    bedConfiguration?: string | { type: string; count: number }[];
    roomSize?: number;
    bathrooms?: number;
    amenities?: string[];
    facilities?: string[];
    pmsRoomId?: string;
  };
  lowestRate?: number | null;
  availableUnits?: number;
  isSelected?: boolean;
  onSelect?: () => void;
  onViewDetails?: () => void;
  className?: string;
}

export function LuxuryRoomCard({
  room,
  lowestRate,
  availableUnits,
  isSelected = false,
  onSelect,
  onViewDetails,
  className,
}: LuxuryRoomCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const images = room.images || [];
  const hasImages = images.length > 0;
  const amenities = room.amenities || room.facilities || [];

  // Availability status
  const isSoldOut = availableUnits === 0;
  const isLowAvailability = availableUnits !== undefined && availableUnits > 0 && availableUnits <= 2;

  return (
    <motion.div
      layout
      className={cn(
        "rounded-2xl border overflow-hidden transition-all duration-300",
        "bg-card hover:shadow-lg",
        isSelected 
          ? "border-primary ring-2 ring-primary/20" 
          : "border-border/60 hover:border-primary/30",
        isSoldOut && "opacity-60",
        className
      )}
    >
      {/* Image section - 60% of card on mobile */}
      <div className="relative aspect-[4/3] sm:aspect-[16/10] overflow-hidden bg-muted">
        {hasImages ? (
          <>
            <img
              src={images[currentImageIndex]}
              alt={room.name}
              className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
            />
            
            {/* Image indicators */}
            {images.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.slice(0, 5).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImageIndex(idx);
                    }}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      idx === currentImageIndex
                        ? "bg-white w-4"
                        : "bg-white/50 hover:bg-white/80"
                    )}
                  />
                ))}
              </div>
            )}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Bed className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}

        {/* Price badge */}
        {lowestRate && !isSoldOut && (
          <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-lg">
            <span className="text-xs text-muted-foreground">from</span>
            <div className="text-lg font-bold text-primary leading-tight">
              <FormattedPrice amount={lowestRate} />
            </div>
            <span className="text-[10px] text-muted-foreground">/night</span>
          </div>
        )}

        {/* Availability badge */}
        {isLowAvailability && (
          <Badge 
            variant="destructive" 
            className="absolute top-3 left-3 text-[10px] uppercase tracking-wider"
          >
            Only {availableUnits} left
          </Badge>
        )}
        {isSoldOut && (
          <Badge 
            variant="secondary" 
            className="absolute top-3 left-3 text-[10px] uppercase tracking-wider"
          >
            Sold Out
          </Badge>
        )}

        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute top-3 left-3 h-8 w-8 rounded-full bg-primary flex items-center justify-center">
            <Check className="h-5 w-5 text-primary-foreground" />
          </div>
        )}
      </div>

      {/* Content section */}
      <div className="p-4 sm:p-5 space-y-3">
        {/* Room name and quick info */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg sm:text-xl font-medium tracking-tight leading-tight">
              {room.name}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-muted-foreground">
              {room.maxPeople && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {room.maxPeople}
                </span>
              )}
              {room.bathrooms && (
                <span className="flex items-center gap-1">
                  <Bath className="h-3.5 w-3.5" />
                  {room.bathrooms}
                </span>
              )}
              {hasBedConfiguration(room.bedConfiguration) && (
                <span className="flex items-center gap-1">
                  <Bed className="h-3.5 w-3.5" />
                  {formatBedConfiguration(room.bedConfiguration)}
                </span>
              )}
            </div>
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            {isExpanded ? (
              <>
                Less <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                More <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>

        {/* Expandable details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {/* Description */}
              {room.description && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                  {room.description}
                </p>
              )}

              {/* Amenities */}
              {amenities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {amenities.slice(0, 6).map((amenity, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="text-[10px] uppercase tracking-wider font-normal"
                    >
                      {amenity}
                    </Badge>
                  ))}
                  {amenities.length > 6 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{amenities.length - 6} more
                    </Badge>
                  )}
                </div>
              )}

              {/* View details link */}
              {onViewDetails && (
                <button
                  onClick={onViewDetails}
                  className="text-sm text-primary font-medium hover:underline"
                >
                  View full details →
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA Button */}
        <Button
          onClick={onSelect}
          disabled={isSoldOut}
          variant={isSelected ? "secondary" : "default"}
          className={cn(
            "w-full h-12 rounded-xl text-base font-medium transition-all duration-200",
            isSelected && "border-2 border-primary"
          )}
        >
          {isSoldOut 
            ? "Sold Out" 
            : isSelected 
            ? "Selected" 
            : "Select This Room"
          }
        </Button>
      </div>
    </motion.div>
  );
}
