import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const Calendar = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Calendar
          </h1>
          <p className="text-muted-foreground">
            Manage bookings calendar
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Calendar Management</CardTitle>
            <CardDescription>
              View and manage your booking calendar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Calendar view coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Calendar;
