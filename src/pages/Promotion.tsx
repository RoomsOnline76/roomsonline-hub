import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const Promotion = () => {
  return (
    <AppLayout>
      <PageHeader 
        title="Promotion" 
        subtitle="Marketing campaigns"
      />

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
    </AppLayout>
  );
};

export default Promotion;
