import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const Promotion = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Promotion
          </h1>
          <p className="text-muted-foreground">
            Marketing campaigns
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Promotion Management</CardTitle>
            <CardDescription>
              Create and manage your marketing campaigns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Promotion features coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Promotion;
