import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

interface BulkLeadDaysPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkLeadDaysPostDialog({ open, onOpenChange }: BulkLeadDaysPostDialogProps) {
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("2025-11-19");
  const [toDate, setToDate] = useState("2025-11-26");
  const [leadDaysPost, setLeadDaysPost] = useState("0");

  const roomTypes = [
    { id: "holidayHouse", name: "Holiday House", count: 9 },
    { id: "oneBedroom", name: "One Bedroom Suite", count: 14 },
    { id: "petiteHotel", name: "Petite Hotel Room", count: 14 },
    { id: "twoBedroom", name: "Two Bedroom Suite", count: 6 },
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
              {/* Left Sidebar - Room Types */}
              <div className="col-span-3 border rounded-lg p-4 space-y-2 max-h-[600px] overflow-y-auto">
                {roomTypes.map((roomType) => (
                  <div key={roomType.id} className="flex items-center justify-between p-2 hover:bg-muted rounded">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={roomType.id}
                        checked={selectedRoomTypes.includes(roomType.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedRoomTypes([...selectedRoomTypes, roomType.id]);
                          } else {
                            setSelectedRoomTypes(selectedRoomTypes.filter(id => id !== roomType.id));
                          }
                        }}
                      />
                      <label htmlFor={roomType.id} className="text-sm cursor-pointer">
                        {roomType.name}
                      </label>
                    </div>
                    <span className="text-sm text-muted-foreground">{roomType.count}</span>
                  </div>
                ))}
              </div>

              {/* Right Content - Form */}
              <div className="col-span-9 space-y-6">
                <div className="border rounded-lg p-6 space-y-4">
                  <div className="space-y-2">
                    <Label>Change lead days post to</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        value={leadDaysPost}
                        onChange={(e) => setLeadDaysPost(e.target.value)}
                        className="w-32"
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  </div>

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
