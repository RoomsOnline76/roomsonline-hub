import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { Link2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DirectLinkTabProps {
  property: { id: string; name: string; slug: string };
}

export function DirectLinkTab({ property }: DirectLinkTabProps) {
  const bookingUrl = `https://book.sleepinafrica.roomsonline.co.za/property/${property.slug}?source=website&integration=direct&property_id=${property.id}`;

  const htmlSnippet = `<a href="${bookingUrl}" target="_blank" rel="noopener noreferrer" 
  style="display:inline-block;padding:12px 24px;background:#e91e63;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
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
          The simplest way to connect — a direct URL that takes guests straight to your booking page.
          Add it to any button, email, or social media post.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <h5 className="font-medium text-foreground mb-1">How to use</h5>
          <ol className="list-decimal list-inside space-y-1">
            <li>Copy the booking URL above</li>
            <li>Paste it into your website's "Book Now" button link</li>
            <li>Or use the HTML button snippet for a ready-made styled button</li>
            <li>All bookings from this link are automatically tracked for your property</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
