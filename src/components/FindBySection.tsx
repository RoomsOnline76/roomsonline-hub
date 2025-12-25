import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";

interface FindByCardProps {
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  onClick?: () => void;
  href?: string;
}

function FindByCard({ title, subtitle, description, imageUrl, onClick, href }: FindByCardProps) {
  const content = (
    <div className="group relative overflow-hidden rounded-lg h-64 sm:h-72 cursor-pointer">
      {/* Background Image */}
      <img
        src={imageUrl}
        alt={title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      
      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6">
        <span className="text-xs font-semibold text-primary/90 uppercase tracking-wider mb-1">
          {subtitle}
        </span>
        <h3 className="text-lg sm:text-xl font-bold text-white mb-2">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-white/80 leading-relaxed line-clamp-3">
          {description}
        </p>
      </div>
    </div>
  );

  if (href) {
    return <Link to={href}>{content}</Link>;
  }

  return <div onClick={onClick}>{content}</div>;
}

// Helper to shuffle and pick random items
function getRandomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Extract image URL from property images
function extractImageUrl(images: unknown): string | null {
  if (!images || !Array.isArray(images) || images.length === 0) return null;
  const img = images[0];
  if (typeof img === "string") return img;
  if (img && typeof img === "object" && "url" in img) {
    return (img as { url: string }).url;
  }
  return null;
}

interface FindBySectionProps {
  onScrollToTypes: () => void;
  onScrollToMap: () => void;
}

export function FindBySection({ onScrollToTypes, onScrollToMap }: FindBySectionProps) {
  // Try to get book_page_images first
  const { data: bookImages } = useQuery({
    queryKey: ["book-page-images"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("book_page_images")
        .select("image_url, alt_text");
      if (error) throw error;
      return data || [];
    },
  });

  // Fallback to property images
  const { data: properties, isLoading } = useQuery({
    queryKey: ["properties-find-by-images"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("images")
        .eq("is_active", true)
        .is("permanently_deleted_at", null);
      if (error) throw error;
      return data || [];
    },
  });

  // Get 3 random images
  const cardImages = useMemo(() => {
    // Use book_page_images if available
    if (bookImages && bookImages.length >= 3) {
      const randomImages = getRandomItems(bookImages, 3);
      return randomImages.map(img => img.image_url);
    }
    
    // Fallback to property images
    if (properties && properties.length > 0) {
      const propertyImages = properties
        .map(p => extractImageUrl(p.images))
        .filter((url): url is string => url !== null);
      
      if (propertyImages.length >= 3) {
        return getRandomItems(propertyImages, 3);
      }
    }
    
    // Fallback placeholder images
    return [
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
      "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80",
    ];
  }, [bookImages, properties]);

  const cards = [
    {
      title: "Pursue the Remarkable",
      subtitle: "EXPERIENCE",
      description: "Discover the experiences that forever spark the spirit and inspire the soul.",
      onClick: onScrollToTypes,
    },
    {
      title: "Explore Our World",
      subtitle: "MAP VIEW",
      description: "Discover hand-picked extraordinary escapes and places that spark the wanderlust and guide you to the remarkable.",
      onClick: onScrollToMap,
    },
    {
      title: "Curated For You",
      subtitle: "CURATED COLLECTIONS",
      description: "Explore our thoughtfully selected collections of handpicked destinations, crafted to inspire your spirit and next adventure.",
      href: "/property_listing",
    },
  ];

  if (isLoading) {
    return (
      <section className="py-8 sm:py-12 bg-background">
        <div className="container mx-auto px-3 sm:px-4">
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground mb-6">
            FIND BY...
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 sm:h-72 rounded-lg" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-8 sm:py-12 bg-background">
      <div className="container mx-auto px-3 sm:px-4">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground mb-6">
          FIND BY...
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {cards.map((card, index) => (
            <FindByCard
              key={card.subtitle}
              title={card.title}
              subtitle={card.subtitle}
              description={card.description}
              imageUrl={cardImages[index]}
              onClick={card.onClick}
              href={card.href}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
