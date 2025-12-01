import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const CalendarEventWedding = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Calendar - Event/Wedding
          </h1>
          <p className="text-muted-foreground">
            Manage event and wedding bookings calendar
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Event/Wedding Calendar</CardTitle>
            <CardDescription>
              View and manage event and wedding booking calendar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Event/Wedding calendar view coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CalendarEventWedding;
