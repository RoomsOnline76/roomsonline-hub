import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            Analytics & insights
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>
              View analytics and insights
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Dashboard reports coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
