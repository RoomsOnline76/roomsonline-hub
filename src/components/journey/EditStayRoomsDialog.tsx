import { useState, useEffect } from 'react';
import { Loader2, Minus, Plus, Bed, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ItineraryStay, RoomSelection } from '@/contexts/ItineraryContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface EditStayRoomsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stay: ItineraryStay;
  onConfirm: (rooms: RoomSelection[], newTotal: number) => void;
}

interface AvailableRoom {
  id: string;
  name: string;
  ratePerNight: number;
  maxGuests: number;
}

export function EditStayRoomsDialog({
  open,
  onOpenChange,
  stay,
  onConfirm,
}: EditStayRoomsDialogProps) {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<RoomSelection[]>(stay.rooms);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingRooms, setIsFetchingRooms] = useState(true);

  // Fetch available room types for this property
  useEffect(() => {
    if (!open || !stay.property_id) return;

    const fetchRoomTypes = async () => {
      setIsFetchingRooms(true);
      try {
        // Check if it's a Hostfully property
        const { data: hostfullyRooms } = await supabase
          .from('hostfully_room_types')
          .select('id, name, daily_rate, max_guests')
          .eq('property_id', stay.property_id)
          .eq('is_active', true);

        if (hostfullyRooms && hostfullyRooms.length > 0) {
          setAvailableRooms(
            hostfullyRooms.map((r) => ({
              id: r.id,
              name: r.name,
              ratePerNight: r.daily_rate || 0,
              maxGuests: r.max_guests || 2,
            }))
          );
          setIsFetchingRooms(false);
          return;
        }

        // Check PMS room types cache
        const { data: pmsRooms } = await supabase
          .from('pms_room_types_cache')
          .select('id, name, max_guests, linked_rate_type_ids')
          .eq('property_id', stay.property_id);

        if (pmsRooms && pmsRooms.length > 0) {
          // Get rates for these rooms
          const { data: rates } = await supabase
            .from('property_rates')
            .select('room_type, amount')
            .eq('property_id', stay.property_id)
            .eq('date', stay.dates.check_in);

          const rateMap = new Map<string, number>();
          rates?.forEach((r) => {
            if (r.room_type) rateMap.set(r.room_type, r.amount || 0);
          });

          setAvailableRooms(
            pmsRooms.map((r) => ({
              id: r.id,
              name: r.name,
              ratePerNight: rateMap.get(r.name) || rateMap.get(r.id) || 0,
              maxGuests: r.max_guests || 2,
            }))
          );
          setIsFetchingRooms(false);
          return;
        }

        // Fallback: derive available rooms from current stay rooms
        // This allows editing quantities without needing external data
        if (stay.rooms.length > 0) {
          setAvailableRooms(
            stay.rooms.map((r) => ({
              id: r.room_type_id,
              name: r.room_type_name,
              ratePerNight: r.rate_per_night,
              maxGuests: 10, // Default max
            }))
          );
        }
      } catch (error) {
        console.error('Error fetching room types:', error);
        // Fallback to current rooms
        if (stay.rooms.length > 0) {
          setAvailableRooms(
            stay.rooms.map((r) => ({
              id: r.room_type_id,
              name: r.room_type_name,
              ratePerNight: r.rate_per_night,
              maxGuests: 10,
            }))
          );
        }
      } finally {
        setIsFetchingRooms(false);
      }
    };

    fetchRoomTypes();
  }, [open, stay.property_id, stay.dates.check_in, stay.rooms]);

  // Reset rooms when dialog opens
  useEffect(() => {
    if (open) {
      setRooms(stay.rooms);
    }
  }, [open, stay.rooms]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const updateRoomQuantity = (roomIndex: number, delta: number) => {
    setRooms((prev) => {
      const updated = [...prev];
      const room = updated[roomIndex];
      const newQuantity = Math.max(0, room.quantity + delta);
      
      if (newQuantity === 0) {
        // Remove the room
        return updated.filter((_, i) => i !== roomIndex);
      }
      
      updated[roomIndex] = {
        ...room,
        quantity: newQuantity,
        total_price: room.rate_per_night * newQuantity * stay.nights,
      };
      return updated;
    });
  };

  const addRoom = (availableRoom: AvailableRoom) => {
    const existingIndex = rooms.findIndex(
      (r) => r.room_type_id === availableRoom.id
    );

    if (existingIndex >= 0) {
      updateRoomQuantity(existingIndex, 1);
    } else {
      setRooms((prev) => [
        ...prev,
        {
          room_type_id: availableRoom.id,
          room_type_name: availableRoom.name,
          quantity: 1,
          rate_per_night: availableRoom.ratePerNight,
          total_price: availableRoom.ratePerNight * stay.nights,
        },
      ]);
    }
  };

  const calculateTotal = () => {
    return rooms.reduce((sum, room) => sum + room.total_price, 0);
  };

  const handleConfirm = () => {
    if (rooms.length === 0) {
      toast({
        title: 'At least one room required',
        description: 'Please add at least one room to your stay.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    const newTotal = calculateTotal();
    onConfirm(rooms, newTotal);
    setIsLoading(false);
  };

  const currentRoomsInAvailable = availableRooms.filter(
    (ar) => !rooms.some((r) => r.room_type_id === ar.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Rooms</DialogTitle>
          <DialogDescription>
            Adjust rooms for your stay at {stay.property_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current rooms */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              Selected Rooms
            </h4>
            {rooms.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No rooms selected
              </p>
            ) : (
              rooms.map((room, index) => (
                <div
                  key={room.room_type_id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{room.room_type_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(room.rate_per_night)} / night
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateRoomQuantity(index, -1)}
                    >
                      {room.quantity === 1 ? (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      ) : (
                        <Minus className="h-4 w-4" />
                      )}
                    </Button>
                    <span className="w-8 text-center font-medium">
                      {room.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateRoomQuantity(index, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add more rooms */}
          {!isFetchingRooms && currentRoomsInAvailable.length > 0 && (
            <div className="space-y-3 pt-2 border-t">
              <h4 className="text-sm font-medium text-muted-foreground">
                Add Room
              </h4>
              {currentRoomsInAvailable.map((room) => (
                <button
                  key={room.id}
                  onClick={() => addRoom(room)}
                  className="w-full flex items-center justify-between p-3 border border-dashed rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Bed className="h-4 w-4 text-muted-foreground" />
                    <div className="text-left">
                      <p className="font-medium text-sm">{room.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(room.ratePerNight)} / night
                      </p>
                    </div>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {isFetchingRooms && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Total */}
          <div className="pt-4 border-t">
            <div className="flex justify-between font-semibold">
              <span>Stay Total ({stay.nights} nights)</span>
              <span>{formatCurrency(calculateTotal())}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading || rooms.length === 0}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Updating...
              </>
            ) : (
              'Update Rooms'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
