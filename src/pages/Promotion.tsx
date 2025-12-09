import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const Promotion = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-3">
        <div className="flex items-baseline gap-2 mb-3">
          <h1 className="text-xl font-bold text-foreground">Promotion</h1>
          <span className="text-xs text-muted-foreground">— Marketing campaigns</span>
        </div>

        <Card>
          <CardHeader className="py-2 px-4">
            <div className="flex items-baseline gap-2">
              <CardTitle className="text-sm">Promotion Management</CardTitle>
              <CardDescription className="text-xs">— Create and manage your marketing campaigns</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Promotion features coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Promotion;
