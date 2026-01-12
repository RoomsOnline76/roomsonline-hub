import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Bed, Users, DollarSign } from "lucide-react";
import { StepProps } from "./types";
import { OnboardingRoomType } from "@/config/onboardingFieldSchema";

export function StepRoomsOverview({
  updateField,
  getAmenityValue
}: StepProps) {
  const roomTypes = getAmenityValue<OnboardingRoomType[]>("room_types", []);

  const addRoom = () => {
    const newRoom: OnboardingRoomType = {
      name: "",
      max_guests: 2,
      base_rate: undefined,
      description: ""
    };
    updateField("amenities.room_types", [...roomTypes, newRoom]);
  };

  const updateRoom = (index: number, field: keyof OnboardingRoomType, value: unknown) => {
    const updated = [...roomTypes];
    updated[index] = { ...updated[index], [field]: value };
    updateField("amenities.room_types", updated);
  };

  const removeRoom = (index: number) => {
    const updated = roomTypes.filter((_, i) => i !== index);
    updateField("amenities.room_types", updated);
  };

  const duplicateRoom = (index: number) => {
    const room = roomTypes[index];
    const duplicated: OnboardingRoomType = {
      ...room,
      name: `${room.name} (Copy)`
    };
    updateField("amenities.room_types", [...roomTypes, duplicated]);
  };

  const totalCapacity = roomTypes.reduce((sum, room) => sum + (room.max_guests || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground">
          Add your room types with basic information. You can add detailed 
          configuration later in the full rooms section.
        </p>
        {roomTypes.length > 0 && (
          <p className="text-sm text-primary font-medium mt-2">
            {roomTypes.length} room type{roomTypes.length !== 1 ? 's' : ''} • Total capacity: {totalCapacity} guests
          </p>
        )}
      </div>

      {/* Room cards */}
      <div className="space-y-4">
        {roomTypes.map((room, index) => (
          <Card key={index} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bed className="h-4 w-4 text-primary" />
                  Room Type {index + 1}
                </CardTitle>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => duplicateRoom(index)}
                    className="h-8 text-xs"
                  >
                    Duplicate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRoom(index)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Room Name */}
              <div className="space-y-2">
                <Label htmlFor={`room-name-${index}`}>Room Name *</Label>
                <Input
                  id={`room-name-${index}`}
                  value={room.name || ""}
                  onChange={(e) => updateRoom(index, "name", e.target.value)}
                  placeholder="e.g., Deluxe Double, Family Suite"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Max Guests */}
                <div className="space-y-2">
                  <Label htmlFor={`room-guests-${index}`} className="flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    Max Guests
                  </Label>
                  <Input
                    id={`room-guests-${index}`}
                    type="number"
                    min={1}
                    max={20}
                    value={room.max_guests || ""}
                    onChange={(e) => updateRoom(index, "max_guests", parseInt(e.target.value) || 1)}
                  />
                </div>

                {/* Base Rate */}
                <div className="space-y-2">
                  <Label htmlFor={`room-rate-${index}`} className="flex items-center gap-1.5">
                    <DollarSign className="h-3 w-3" />
                    Base Rate (ZAR)
                  </Label>
                  <Input
                    id={`room-rate-${index}`}
                    type="number"
                    min={0}
                    value={room.base_rate || ""}
                    onChange={(e) => updateRoom(index, "base_rate", parseFloat(e.target.value) || undefined)}
                    placeholder="per night"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add room button */}
      <Button
        type="button"
        variant="outline"
        onClick={addRoom}
        className="w-full gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Room Type
      </Button>

      {/* No rooms message */}
      {roomTypes.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Bed className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium mb-1">No room types yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your first room type to get started
          </p>
          <Button type="button" onClick={addRoom} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Room Type
          </Button>
        </div>
      )}

      {/* Tip */}
      {roomTypes.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <h4 className="font-medium text-sm mb-2">Tip</h4>
          <p className="text-sm text-muted-foreground">
            Use the "Duplicate" button to quickly create similar room types. 
            Detailed room configuration (images, amenities, rates) can be set 
            in the full property editor.
          </p>
        </div>
      )}
    </div>
  );
}
