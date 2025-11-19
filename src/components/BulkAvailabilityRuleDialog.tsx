import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface BulkAvailabilityRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkAvailabilityRuleDialog({ open, onOpenChange }: BulkAvailabilityRuleDialogProps) {
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

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    holidayHouse: true,
    oneBedroom: false,
    petiteHotel: false,
    twoBedroom: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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

  const roomTypes = [
    {
      id: "holidayHouse",
      name: "Holiday House",
      count: 9,
    },
    {
      id: "oneBedroom",
      name: "One Bedroom Suite",
      count: 14,
    },
    {
      id: "petiteHotel",
      name: "Petite Hotel Room",
      count: 14,
    },
    {
      id: "twoBedroom",
      name: "Two Bedroom Suite",
      count: 6,
    },
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
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="sunday"
                          checked={selectedDays.sunday}
                          onCheckedChange={() => toggleDay("sunday")}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <label htmlFor="sunday" className="text-sm cursor-pointer">Sunday</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="monday"
                          checked={selectedDays.monday}
                          onCheckedChange={() => toggleDay("monday")}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <label htmlFor="monday" className="text-sm cursor-pointer">Monday</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="tuesday"
                          checked={selectedDays.tuesday}
                          onCheckedChange={() => toggleDay("tuesday")}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <label htmlFor="tuesday" className="text-sm cursor-pointer">Tuesday</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="wednesday"
                          checked={selectedDays.wednesday}
                          onCheckedChange={() => toggleDay("wednesday")}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <label htmlFor="wednesday" className="text-sm cursor-pointer">Wednesday</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="thursday"
                          checked={selectedDays.thursday}
                          onCheckedChange={() => toggleDay("thursday")}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <label htmlFor="thursday" className="text-sm cursor-pointer">Thursday</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="friday"
                          checked={selectedDays.friday}
                          onCheckedChange={() => toggleDay("friday")}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <label htmlFor="friday" className="text-sm cursor-pointer">Friday</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="saturday"
                          checked={selectedDays.saturday}
                          onCheckedChange={() => toggleDay("saturday")}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <label htmlFor="saturday" className="text-sm cursor-pointer">Saturday</label>
                      </div>
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

                {/* Rules Table */}
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SOURCE</TableHead>
                        <TableHead>NAME</TableHead>
                        <TableHead>ROOM TYPE</TableHead>
                        <TableHead>STARTDATE</TableHead>
                        <TableHead>ENDDATE</TableHead>
                        <TableHead>RRULE</TableHead>
                        <TableHead>CONFIG</TableHead>
                        <TableHead>INSERTEDDATE</TableHead>
                        <TableHead>ACTION</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>rules</TableCell>
                        <TableCell>Availability</TableCell>
                        <TableCell></TableCell>
                        <TableCell>1990-01-01</TableCell>
                        <TableCell>2100-12-31</TableCell>
                        <TableCell>FREQ=DAILY;</TableCell>
                        <TableCell>()</TableCell>
                        <TableCell>2025-07-31</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
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
