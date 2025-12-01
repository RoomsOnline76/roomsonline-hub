import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const CalendarConference = () => {
  const navigate = useNavigate();
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [viewMode, setViewMode] = useState<"week" | "month" | "year">("month");
  const [currentDate, setCurrentDate] = useState(new Date(2025, 10, 19));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <Tabs value="conference" className="mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="accommodation" onClick={() => navigate("/admin/calendar")}>
              Accommodation
            </TabsTrigger>
            <TabsTrigger value="event" onClick={() => navigate("/admin/calendar/event-wedding")}>
              Event/Wedding
            </TabsTrigger>
            <TabsTrigger value="conference">Conference</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-1">Conference Calendar</h1>
          <p className="text-muted-foreground">Manage conference bookings</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-4 mb-6">
              <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select Property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="property1">Property 1</SelectItem>
                  <SelectItem value="property2">Property 2</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="default" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>

              <div className="ml-auto flex gap-2">
                <Button variant="default">Save</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="default" className="gap-2">
                      Rules/Bulk Updates
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem>Bulk Rate</DropdownMenuItem>
                    <DropdownMenuItem>Bulk Availability</DropdownMenuItem>
                    <DropdownMenuItem>Stop Sell</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {!selectedProperty ? (
              <div className="text-center py-8 text-muted-foreground">
                Select a property to view the calendar
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                Conference calendar view coming soon...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CalendarConference;
