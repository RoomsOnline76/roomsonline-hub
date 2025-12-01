import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const CalendarAccommodation = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Calendar - Accommodation
          </h1>
          <p className="text-muted-foreground">
            Manage accommodation bookings calendar
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Accommodation Calendar</CardTitle>
            <CardDescription>
              View and manage accommodation booking calendar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Accommodation calendar view coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CalendarAccommodation;
