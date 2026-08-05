import { useState, useEffect } from "react";
import { useBrandOverride } from "@/hooks/useBrandOverride";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bed } from "lucide-react";
import { ShowcaseAvailabilityCalendar } from "@/components/showcase/ShowcaseAvailabilityCalendar";
import RoomAvailabilityCalendar from "@/components/RoomAvailabilityCalendar";
import { PublicLayout } from "@/components/layout/PublicLayout";

interface RoomType {
  id: string;
  name: string;
  pmsRoomId?: string;
}

interface Property {
  id: string;
  name: string;
  slug: string;
  amenities: any;
  external_system?: string;
}

export default function RoomAvailability() {
  const { propertySlug, roomSlug } = useParams<{ propertySlug: string; roomSlug: string }>();
  useBrandOverride(propertySlug);
  const [property, setProperty] = useState<Property | null>(null);
  const [room, setRoom] = useState<RoomType | null>(null);
  const [loading, setLoading] = useState(true);

  const slugifyRoomName = (name: string) => {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };

  useEffect(() => {
    if (propertySlug && roomSlug) {
      fetchData();
    }
  }, [propertySlug, roomSlug]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propertySlug || "");
      
      let query = supabase.from("public_properties").select("*");
      
      if (isUuid) {
        query = query.eq("id", propertySlug);
      } else {
        query = query.eq("slug", propertySlug);
      }
      
      const { data: propertyData, error: propertyError } = await query.single();

      if (propertyError) throw propertyError;
      
      setProperty(propertyData);

      const amenitiesData = propertyData.amenities as any;
      const roomTypes = amenitiesData?.room_types || [];
      const foundRoom = roomTypes.find((r: RoomType) => 
        slugifyRoomName(r.name) === roomSlug || 
        String(r.id) === roomSlug || 
        String(r.pmsRoomId) === roomSlug
      );
      
      if (foundRoom) {
        setRoom(foundRoom);
      }
    } catch (error) {
      console.error("Error fetching room:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-12">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-5 w-32 mb-8" />
          <Skeleton className="h-96 w-full max-w-2xl mx-auto rounded-lg" />
        </div>
      </PublicLayout>
    );
  }

  if (!property || !room) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-24 text-center">
          <Bed className="h-16 w-16 mx-auto mb-6 text-muted-foreground/20" />
          <h1 className="font-display text-2xl sm:text-3xl mb-3">Room Not Found</h1>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            The room you're looking for doesn't exist or is no longer available.
          </p>
          <Link to="/">
            <Button>Return Home</Button>
          </Link>
        </div>
      </PublicLayout>
    );
  }

  // Get the room ID - prioritize pmsRoomId, fallback to id - ensure string format
  const roomId = String(room.pmsRoomId || room.id);

  return (
    <PublicLayout hideHeader>
      <div className="container mx-auto px-4 pt-6">
        <ShowcaseAvailabilityCalendar
          propertyId={property.id}
          amenities={property.amenities}
          title="Availability & rates"
        />
      </div>
      <RoomAvailabilityCalendar
        propertyId={property.id}
        propertySlug={property.slug || property.id}
        propertyName={property.name}
        roomName={room.name}
        roomId={roomId}
        externalSystem={property.external_system}
      />

    </PublicLayout>
  );
}
