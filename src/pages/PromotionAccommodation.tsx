import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const PromotionAccommodation = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Promotion - Accommodation
          </h1>
          <p className="text-muted-foreground">
            Marketing campaigns for accommodation
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Accommodation Promotions</CardTitle>
            <CardDescription>
              Create and manage accommodation marketing campaigns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Accommodation promotion features coming soon...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PromotionAccommodation;
