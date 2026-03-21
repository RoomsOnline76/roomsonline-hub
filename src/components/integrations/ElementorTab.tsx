import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Blocks, LayoutGrid, Calendar, ImageIcon } from "lucide-react";
import { CodeSnippetBlock } from "@/components/integrations/CodeSnippetBlock";

interface ElementorTabProps {
  property: {
    id: string;
    name: string;
    slug: string;
    brand_primary_color: string | null;
  };
}

const WIDGETS = [
  {
    title: "Booking Widget",
    icon: Calendar,
    description: "Full booking engine with date selection, room picker, and checkout. Supports compact, standard, and full layouts.",
    controls: ["Property ID", "Layout (compact/standard/full)", "Brand Color", "Button Text", "Height", "Custom CSS Class"],
    shortcode: `[rolos_booking_widget property_id="YOUR_UUID" color="#2563EB" layout="standard"]`,
  },
  {
    title: "Property Card",
    icon: ImageIcon,
    description: "Display a property summary card with image, pricing, and availability status. Choose minimal or detailed style.",
    controls: ["Property ID", "Show Price (toggle)", "Show Availability (toggle)", "Card Style (minimal/detailed)", "Button Color"],
    shortcode: `[rolos_property_card property_id="YOUR_UUID"]`,
  },
  {
    title: "Availability Grid",
    icon: LayoutGrid,
    description: "Multi-month calendar grid showing real-time availability. Guests can visually scan open dates.",
    controls: ["Property ID", "Months to Display (1–6)", "Color Scheme"],
    shortcode: `[rolos_availability property_id="YOUR_UUID" months="2"]`,
  },
];

export function ElementorTab({ property }: ElementorTabProps) {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Blocks className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Elementor Widgets</CardTitle>
              <CardDescription>
                Drag-and-drop ROL'OS widgets inside the Elementor editor
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
            <h4 className="font-semibold">Setup Instructions</h4>
            <ol className="space-y-2 list-decimal list-inside text-muted-foreground">
              <li>Install and activate the <strong>ROL'OS Plugin</strong> on your WordPress site</li>
              <li>Ensure <strong>Elementor</strong> (free or Pro) is installed and active</li>
              <li>Open any page with the Elementor editor</li>
              <li>Search for <strong>"ROL'OS"</strong> in the widget panel — all 3 widgets appear under the ROL'OS category</li>
              <li>Drag a widget onto your page and configure the controls in the sidebar</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Widget Cards */}
      {WIDGETS.map((w) => (
        <Card key={w.title}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <w.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">ROL'OS {w.title}</CardTitle>
                <CardDescription className="text-xs">{w.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Elementor Controls
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {w.controls.map((c) => (
                  <Badge key={c} variant="secondary" className="text-xs font-normal">
                    <CheckCircle2 className="h-3 w-3 mr-1 text-primary" />
                    {c}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Shortcode Fallback
              </h5>
              <CodeSnippetBlock
                code={w.shortcode.replace("YOUR_UUID", property.id)}
                language="html"
                title={`${w.title} Shortcode`}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
