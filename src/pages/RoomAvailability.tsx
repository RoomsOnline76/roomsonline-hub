import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bed } from "lucide-react";
import RoomAvailabilityCalendar from "@/components/RoomAvailabilityCalendar";

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
        slugifyRoomName(r.name) === roomSlug || r.id === roomSlug
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
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-10 w-1/3 mb-4" />
          <Skeleton className="h-96 w-full max-w-2xl mx-auto" />
        </div>
      </div>
    );
  }

  if (!property || !room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Bed className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <h1 className="text-2xl font-bold mb-4">Room Not Found</h1>
          <p className="text-muted-foreground mb-6">The room you're looking for doesn't exist.</p>
          <Link to="/">
            <Button>Return Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Get the room ID - prioritize pmsRoomId, fallback to id
  const roomId = room.pmsRoomId || room.id;

  return (
    <RoomAvailabilityCalendar
      propertyId={property.id}
      propertySlug={property.slug || property.id}
      propertyName={property.name}
      roomName={room.name}
      roomId={roomId}
      externalSystem={property.external_system}
    />
  );
}
