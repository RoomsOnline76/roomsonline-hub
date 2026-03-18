import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { Link2, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PUBLIC_DOMAIN } from "@/lib/config";

interface DirectLinkTabProps {
  property: { id: string; name: string; slug: string; brand_primary_color: string | null };
}

export function DirectLinkTab({ property }: DirectLinkTabProps) {
  const brandColor = property.brand_primary_color || "#e91e8c";
  const bookingUrl = `${PUBLIC_DOMAIN}/booking/${property.slug}?source=website&integration=direct&property_id=${property.id}&brand_color=${encodeURIComponent(brandColor)}`;

  const htmlSnippet = `<a href="${bookingUrl}" target="_blank" rel="noopener noreferrer" 
  style="display:inline-block;padding:12px 24px;background:${brandColor};color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
  Book Now
</a>`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Direct Booking Link</CardTitle>
          </div>
          <IntegrationToggle propertyId={property.id} integrationType="direct" />
        </div>
        <CardDescription>
          This link directs guests to the <strong>Sleeping In Africa</strong> booking portal.
          From there, they are redirected to your property's dedicated booking page where they can
          browse rooms, check availability, and complete their reservation — all within the
          ROL'OS-powered booking experience.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Commission notice */}
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-amber-800 dark:text-amber-200">
            <strong>Commission applies:</strong> Bookings made through this link incur the
            commission percentage as specified in your property agreement with RoomsOnline.
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Your Booking URL</h4>
          <CodeSnippetBlock code={bookingUrl} language="text" title="Direct Link" />
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">HTML Button</h4>
          <CodeSnippetBlock code={htmlSnippet} language="html" title="Embed as Button" />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" size="sm" asChild>
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Preview Link
            </a>
          </Button>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <h5 className="font-medium text-foreground mb-1">How it works</h5>
          <ol className="list-decimal list-inside space-y-1">
            <li>Copy the booking URL above</li>
            <li>Paste it into your website's "Book Now" button, email signature, or social media bio</li>
            <li>When a guest clicks, they are taken to the Sleeping In Africa booking portal</li>
            <li>The portal redirects them to your property's booking page with live availability</li>
            <li>All bookings are automatically tracked and attributed to your property</li>
            <li>Commission is calculated per your agreement — no hidden fees</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
