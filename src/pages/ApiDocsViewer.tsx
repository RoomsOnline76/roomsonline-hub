import { AppSidebar } from "@/components/layout/AppSidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Book, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROLOS_API_GROUPS, ROLOS_API_VERSION, ROLOS_API_ACTION_COUNT } from "@/config/rolosApiActions";

const API_SECTIONS = ROLOS_API_GROUPS;


export default function ApiDocsViewer() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <PageHeader
          title="ROL'OS API Documentation"
          subtitle={`${ROLOS_API_VERSION} — REST API reference for the Native PMS Adapter · ${ROLOS_API_ACTION_COUNT} endpoints`}
          actions={
            <a href="/public/docs/ROLOS-Developer-REST-API-v3.docx" target="_blank" rel="noreferrer">
              <Button variant="outline" className="gap-1.5">
                <ExternalLink className="h-4 w-4" />
                Full API Spec (docx)
              </Button>
            </a>
          }
        />

        <div className="grid gap-4 mt-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Book className="h-4 w-4" />
                Base URL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <code className="text-sm bg-muted px-3 py-2 rounded block font-mono">
                POST {import.meta.env.VITE_SUPABASE_URL}/functions/v1/roomsonline-pms-api
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                All requests are POST with JSON body containing <code className="bg-muted px-1 rounded">action</code> and <code className="bg-muted px-1 rounded">propertyId</code>.
                Every response carries rate limit headers (<code className="bg-muted px-1 rounded">X-RateLimit-Limit</code>, <code className="bg-muted px-1 rounded">X-RateLimit-Remaining</code>, <code className="bg-muted px-1 rounded">X-RateLimit-Reset</code>) and <code className="bg-muted px-1 rounded">X-Api-Version: {ROLOS_API_VERSION}</code>.
                Actions disabled per property in Admin → API UI Configurator (API Gates) return <code className="bg-muted px-1 rounded">403</code>.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Portfolio API: <code className="bg-muted px-1 rounded">GET /functions/v1/booking-portfolio-api?portfolio=&lt;slug&gt;&amp;include_static_content=true</code> returns <code className="bg-muted px-1 rounded">cancellation_policies</code>, <code className="bg-muted px-1 rounded">reservation_policies</code>, <code className="bg-muted px-1 rounded">policy_rate_plan_links</code>, <code className="bg-muted px-1 rounded">payment_methods</code> and <code className="bg-muted px-1 rounded">contacts</code> on each property.
              </p>
            </CardContent>
          </Card>

          {API_SECTIONS.map((section) => (
            <Card key={section.title}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {section.actions.map((a) => (
                  <div key={a.action} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                    <Badge variant="outline" className="text-xs font-mono shrink-0">{a.method}</Badge>
                    <code className="text-sm font-mono text-primary">{a.action}</code>
                    <span className="text-xs text-muted-foreground ml-auto">{a.desc}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
