import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

interface BulkStopSellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkStopSellDialog({ open, onOpenChange }: BulkStopSellDialogProps) {
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("2025-11-19");
  const [toDate, setToDate] = useState("2025-11-26");
  const [selectedDays, setSelectedDays] = useState({
    allDays: true,
    sunday: true,
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
  });

  const toggleDay = (day: keyof typeof selectedDays) => {
    if (day === "allDays") {
      const newValue = !selectedDays.allDays;
      setSelectedDays({
        allDays: newValue,
        sunday: newValue,
        monday: newValue,
        tuesday: newValue,
        wednesday: newValue,
        thursday: newValue,
        friday: newValue,
        saturday: newValue,
      });
    } else {
      setSelectedDays(prev => ({
        ...prev,
        [day]: !prev[day],
        allDays: false,
      }));
    }
  };

  const rooms = [
    { id: "loftRoom5", name: "Loft Room 5" },
    { id: "loftRoom6", name: "Loft Room 6" },
    { id: "room1", name: "Room 1" },
    { id: "room2", name: "Room 2" },
    { id: "room3", name: "Room 3" },
    { id: "room4", name: "Room 4" },
    { id: "room7", name: "Room 7" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calendar</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="roomTypes" className="w-full">
          <TabsList className="bg-primary">
            <TabsTrigger value="roomTypes" className="data-[state=active]:bg-primary/80 data-[state=active]:text-primary-foreground">
              Room Types
            </TabsTrigger>
            <TabsTrigger value="special" className="data-[state=active]:bg-primary/80 data-[state=active]:text-primary-foreground">
              Special
            </TabsTrigger>
            <TabsTrigger value="package" className="data-[state=active]:bg-primary/80 data-[state=active]:text-primary-foreground">
              Package
            </TabsTrigger>
            <TabsTrigger value="addons" className="data-[state=active]:bg-primary/80 data-[state=active]:text-primary-foreground">
              Addons
            </TabsTrigger>
            <TabsTrigger value="admin" className="data-[state=active]:bg-primary/80 data-[state=active]:text-primary-foreground">
              Admin
            </TabsTrigger>
          </TabsList>

          <TabsContent value="roomTypes" className="mt-4">
            <div className="grid grid-cols-12 gap-4">
              {/* Left Sidebar - Rooms */}
              <div className="col-span-3 border rounded-lg p-4 space-y-2 max-h-[600px] overflow-y-auto">
                {rooms.map((room) => (
                  <div key={room.id} className="flex items-center p-2 hover:bg-muted rounded">
                    <Checkbox
                      id={room.id}
                      checked={selectedRoomTypes.includes(room.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedRoomTypes([...selectedRoomTypes, room.id]);
                        } else {
                          setSelectedRoomTypes(selectedRoomTypes.filter(id => id !== room.id));
                        }
                      }}
                    />
                    <label htmlFor={room.id} className="text-sm cursor-pointer ml-2">
                      {room.name}
                    </label>
                  </div>
                ))}
              </div>

              {/* Right Content - Form */}
              <div className="col-span-9 space-y-6">
                <div className="border rounded-lg p-6 space-y-4">
                  <div className="space-y-2">
                    <Label>From - To</Label>
                    <div className="flex gap-4 items-center">
                      <Input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Days*</Label>
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="allDays"
                          checked={selectedDays.allDays}
                          onCheckedChange={() => toggleDay("allDays")}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <label htmlFor="allDays" className="text-sm cursor-pointer">All days</label>
                      </div>
                      {["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) => (
                        <div key={day} className="flex items-center space-x-2">
                          <Checkbox
                            id={day}
                            checked={selectedDays[day as keyof typeof selectedDays]}
                            onCheckedChange={() => toggleDay(day as keyof typeof selectedDays)}
                            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                          <label htmlFor={day} className="text-sm cursor-pointer capitalize">{day}</label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button className="bg-primary hover:bg-primary/90">
                      Create Rule
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="special">
            <div className="text-center py-12 text-muted-foreground">
              <p>Special configuration coming soon</p>
            </div>
          </TabsContent>

          <TabsContent value="package">
            <div className="text-center py-12 text-muted-foreground">
              <p>Package configuration coming soon</p>
            </div>
          </TabsContent>

          <TabsContent value="addons">
            <div className="text-center py-12 text-muted-foreground">
              <p>Addons configuration coming soon</p>
            </div>
          </TabsContent>

          <TabsContent value="admin">
            <div className="text-center py-12 text-muted-foreground">
              <p>Admin settings coming soon</p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
