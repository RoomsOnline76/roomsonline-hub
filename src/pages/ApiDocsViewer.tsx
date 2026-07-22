import { AppSidebar } from "@/components/layout/AppSidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Book, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_SECTIONS = [
  {
    title: "Availability & Rates",
    actions: [
      { method: "POST", action: "fetch_availability", desc: "Get room availability for a date range" },
      { method: "POST", action: "get_room_types", desc: "List all room types for a property" },
      { method: "POST", action: "get_rate_types", desc: "List rate types (rack, promo, etc.)" },
      { method: "POST", action: "set_availability", desc: "Update availability for a room type" },
      { method: "POST", action: "set_rates", desc: "Set rates for a room/rate type combo" },
      { method: "POST", action: "get_rate_plans", desc: "List ROL'OS rate plans" },
      { method: "POST", action: "get_rate_seasons", desc: "List rate seasons" },
    ],
  },
  {
    title: "Reservations",
    actions: [
      { method: "POST", action: "get_reservations", desc: "List reservations with filters" },
      { method: "POST", action: "create_reservation", desc: "Create a new reservation" },
      { method: "POST", action: "modify_reservation", desc: "Modify an existing reservation" },
      { method: "POST", action: "cancel_reservation", desc: "Cancel a reservation" },
    ],
  },
  {
    title: "Guest CRM",
    actions: [
      { method: "POST", action: "get_guest_profiles", desc: "List guest profiles" },
      { method: "POST", action: "get_guest_profile", desc: "Get a single guest profile" },
      { method: "POST", action: "create_guest_profile", desc: "Create a guest profile" },
      { method: "POST", action: "update_guest_profile", desc: "Update guest profile" },
    ],
  },
  {
    title: "Operations",
    actions: [
      { method: "POST", action: "check_in", desc: "Check in a guest" },
      { method: "POST", action: "check_out", desc: "Check out a guest" },
      { method: "POST", action: "get_housekeeping_board", desc: "Get housekeeping task board" },
      { method: "POST", action: "get_daily_metrics", desc: "Get daily operational metrics" },
    ],
  },
  {
    title: "Folios & Charges",
    actions: [
      { method: "POST", action: "get_folio", desc: "Get folio for a booking" },
      { method: "POST", action: "add_folio_charge", desc: "Add a charge to a folio" },
      { method: "POST", action: "process_folio_payment", desc: "Process payment on a folio" },
      { method: "POST", action: "apply_service_charges", desc: "Apply service charges" },
    ],
  },
  {
    title: "Webhooks",
    actions: [
      { method: "POST", action: "subscribe_webhook", desc: "Subscribe to event webhooks" },
      { method: "POST", action: "unsubscribe_webhook", desc: "Unsubscribe from webhooks" },
      { method: "POST", action: "list_webhook_subscriptions", desc: "List webhook subscriptions" },
      { method: "POST", action: "test_webhook", desc: "Send a test webhook ping" },
    ],
  },
  {
    title: "Static Content",
    actions: [
      { method: "POST", action: "get_cancellation_policies", desc: "Cancellation policies + linked rate plans" },
      { method: "POST", action: "get_reservation_policies", desc: "Reservation (deposit/guarantee) policies + linked rate plans" },
      { method: "POST", action: "get_payment_methods", desc: "Accepted payment methods (provider display name, logo_key, currencies)" },
      { method: "POST", action: "get_property_contact_details", desc: "Public contact details (reception, reservations, landlord)" },
    ],
  },
  {
    title: "System",
    actions: [
      { method: "POST", action: "get_capabilities", desc: "Get adapter capabilities" },
      { method: "POST", action: "health_check", desc: "Health check endpoint" },
      { method: "POST", action: "get_ui_config", desc: "Get UI configuration" },
    ],
  },
];

export default function ApiDocsViewer() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <PageHeader
          title="ROL'OS API Documentation"
          subtitle="v1 — REST API reference for the Native PMS Adapter"
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
                Rate limit headers (<code className="bg-muted px-1 rounded">X-RateLimit-*</code>) are included on every response.
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
