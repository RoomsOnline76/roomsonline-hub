import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Calendar, Megaphone, BookOpen } from "lucide-react";

const Admin = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Admin
          </h1>
          <p className="text-muted-foreground">
            Welcome to the admin area
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Admin Overview</CardTitle>
            <CardDescription>
              Use the navigation menu above to access different admin sections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Select an option from the Admin dropdown in the navigation to manage:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="flex items-start gap-3 p-4 border border-border rounded-lg">
                  <Building2 className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Property Overview</h3>
                    <p className="text-sm text-muted-foreground">Manage your active and deleted properties</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 border border-border rounded-lg">
                  <Calendar className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Calendar</h3>
                    <p className="text-sm text-muted-foreground">View and manage bookings calendar</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 border border-border rounded-lg">
                  <Megaphone className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Promotion</h3>
                    <p className="text-sm text-muted-foreground">Create and manage marketing campaigns</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 border border-border rounded-lg">
                  <BookOpen className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Bookings</h3>
                    <p className="text-sm text-muted-foreground">View all reservations</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Admin;
