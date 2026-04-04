import { motion } from "framer-motion";
import { MapPin, Car } from "lucide-react";

interface NeighborhoodGuideProps {
  neighbourhoodDescription?: string | null;
  gettingAround?: string | null;
  poi?: {
    restaurants_cafes?: string | null;
    restaurants_cafes_distance?: string | null;
    public_transport?: string | null;
    public_transport_distance?: string | null;
    closest_airport?: string | null;
    closest_airport_distance?: string | null;
  } | null;
}

export function NeighborhoodGuide({ neighbourhoodDescription, gettingAround, poi }: NeighborhoodGuideProps) {
  const hasPoi = poi && (poi.restaurants_cafes || poi.public_transport || poi.closest_airport);
  
  if (!neighbourhoodDescription && !gettingAround && !hasPoi) return null;

  const renderParagraphs = (text: string) =>
    text.split(/\n\n|\n/).filter((p) => p.trim()).map((p, i) => (
      <p key={i} className="text-sm text-muted-foreground leading-relaxed">{p.trim()}</p>
    ));

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6 }}
      className="py-8 sm:py-10 border-t border-border/40"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* The Neighborhood */}
        {(neighbourhoodDescription || hasPoi) && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-4 w-4 text-primary" />
              <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">
                The neighbourhood
              </h2>
            </div>
            
            {neighbourhoodDescription && (
              <div className="space-y-3 mb-4">
                {renderParagraphs(neighbourhoodDescription)}
              </div>
            )}

            {/* POI items */}
            {hasPoi && (
              <div className="space-y-2 mt-4">
                {poi.restaurants_cafes && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground min-w-[100px]">Dining</span>
                    <span>{poi.restaurants_cafes}{poi.restaurants_cafes_distance ? ` (${poi.restaurants_cafes_distance})` : ''}</span>
                  </div>
                )}
                {poi.closest_airport && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground min-w-[100px]">Airport</span>
                    <span>{poi.closest_airport}{poi.closest_airport_distance ? ` (${poi.closest_airport_distance})` : ''}</span>
                  </div>
                )}
                {poi.public_transport && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground min-w-[100px]">Transport</span>
                    <span>{poi.public_transport}{poi.public_transport_distance ? ` (${poi.public_transport_distance})` : ''}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Getting Around */}
        {gettingAround && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Car className="h-4 w-4 text-primary" />
              <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">
                Getting around
              </h2>
            </div>
            <div className="space-y-3">
              {renderParagraphs(gettingAround)}
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}
