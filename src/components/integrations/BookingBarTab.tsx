import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { LayoutTemplate, AlertCircle, AlertTriangle } from "lucide-react";
import { PUBLIC_DOMAIN } from "@/lib/config";

interface BookingBarTabProps {
  property: { id: string; name: string; slug: string; brand_primary_color: string | null };
}

export function BookingBarTab({ property }: BookingBarTabProps) {
  const brandColor = property.brand_primary_color || "#e91e63";
  const encodedColor = encodeURIComponent(brandColor);
  const bookingUrl = `${PUBLIC_DOMAIN}/booking/${property.slug}?source=website&integration=booking_bar&property_id=${property.id}&brand_color=${encodedColor}`;

  const snippet = `<!-- RoomsOnline Floating Booking Bar -->
<div id="rolos-booking-bar" style="position:fixed;bottom:0;left:0;right:0;z-index:9999;background:${brandColor};box-shadow:0 -2px 12px rgba(0,0,0,0.15);padding:12px 20px;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;font-family:system-ui,-apple-system,sans-serif;">
  <label style="color:#fff;font-size:14px;font-weight:500;">
    Check-in
    <input type="date" id="rolos-checkin" style="margin-left:6px;padding:6px 10px;border:none;border-radius:4px;font-size:14px;" />
  </label>
  <label style="color:#fff;font-size:14px;font-weight:500;">
    Check-out
    <input type="date" id="rolos-checkout" style="margin-left:6px;padding:6px 10px;border:none;border-radius:4px;font-size:14px;" />
  </label>
  <button onclick="(function(){
    var ci=document.getElementById('rolos-checkin').value;
    var co=document.getElementById('rolos-checkout').value;
    var url='${bookingUrl}';
    if(ci) url+='&checkin='+ci;
    if(co) url+='&checkout='+co;
    window.open(url,'_blank');
  })()" style="background:#fff;color:${brandColor};border:none;padding:10px 24px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;">
    Book ${property.name}
  </button>
</div>`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Floating Booking Bar</CardTitle>
          </div>
          <IntegrationToggle propertyId={property.id} integrationType="booking_bar" />
        </div>
        <CardDescription>
          A persistent bar fixed to the bottom of your website with <strong>check-in and check-out date pickers</strong>.
          When a guest selects dates and clicks <em>Book</em>, they are redirected to the{" "}
          <strong>Sleeping In Africa booking portal</strong> at{" "}
          <code className="bg-muted px-1 rounded text-xs">book.sleepinafrica.roomsonline.co.za</code>{" "}
          to complete their reservation. Styled in your brand colour{" "}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: brandColor }} />
            <code className="bg-muted px-1 rounded text-xs">{brandColor}</code>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Commission warning */}
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <span className="text-amber-800 dark:text-amber-200">
            <strong>Commission applies:</strong> Bookings made through the booking bar are redirected to the Sleeping In Africa portal
            and incur the commission percentage as specified in your property agreement.
          </span>
        </div>

        {/* Redirect route info */}
        <div className="flex items-start gap-2.5 rounded-lg border border-muted bg-muted/30 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-muted-foreground space-y-1">
            <p>
              <strong>Redirect route:</strong> Guest selects dates → clicks Book → opens{" "}
              <code className="bg-muted px-1 rounded text-xs">book.sleepinafrica.roomsonline.co.za/property/{property.slug}</code>{" "}
              in a new tab with dates pre-filled → completes booking on the portal.
            </p>
            <p>
              💡 <em>If you also have the Full Embed or Widget installed on your site, the bar can link to that section instead of redirecting off-site.</em>
            </p>
          </div>
        </div>

        <CodeSnippetBlock code={snippet} language="html" title="Floating Bar with Date Pickers" />

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <h5 className="font-medium text-foreground mb-1">How to install</h5>
          <ol className="list-decimal list-inside space-y-1">
            <li>Copy the snippet above</li>
            <li>Paste it just before <code className="bg-muted px-1 rounded">&lt;/body&gt;</code> in your website</li>
            <li>The bar appears fixed at the bottom with check-in/check-out date pickers in your brand colours</li>
            <li>Guests select dates and click <strong>Book</strong> — they are redirected to the Sleeping In Africa portal to complete the reservation</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
