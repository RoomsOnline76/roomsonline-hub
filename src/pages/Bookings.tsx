import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const Bookings = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Bookings
          </h1>
          <p className="text-muted-foreground">
            View all reservations
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Booking Management</CardTitle>
            <CardDescription>
              View and manage all your bookings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Booking list coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Bookings;
