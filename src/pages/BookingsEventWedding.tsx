import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const BookingsEventWedding = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Bookings - Event/Wedding
          </h1>
          <p className="text-muted-foreground">
            View event and wedding reservations
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Event/Wedding Bookings</CardTitle>
            <CardDescription>
              View and manage event and wedding bookings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Event/Wedding booking list coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BookingsEventWedding;
