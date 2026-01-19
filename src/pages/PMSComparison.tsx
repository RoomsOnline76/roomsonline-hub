import { useEffect } from "react";
import { Link } from "react-router-dom";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  PMSComparisonTable, 
  PMSDetailAccordion, 
  PlatformComparisonMatrix, 
  PMSComparisonFAQ,
  faqSchema,
  getCapabilityCount
} from "@/components/pms-comparison";
import { 
  Check, 
  X, 
  ArrowRight, 
  Shield, 
  Layers, 
  RefreshCw, 
  Building2, 
  Hotel, 
  TreePalm, 
  Home,
  Users,
  Mail,
  Phone
} from "lucide-react";

export default function PMSComparison() {
  // Set page meta
  useEffect(() => {
    document.title = "Compare Property Management Systems (PMS) | RoomsOnline";
    
    // Add meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Compare Benson, NightsBridge, Cloudbeds and other PMS systems integrated with RoomsOnline. Live availability, rate fetching, booking capabilities for SA hospitality.');
    }
    
    // Add JSON-LD schema
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(faqSchema);
    document.head.appendChild(script);
    
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return (
    <PublicLayout>
      <div className="min-h-screen">
        {/* Hero Section */}
        <section className="py-12 sm:py-16 bg-gradient-to-b from-muted/50 to-background">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-4xl mx-auto text-center">
              <Badge variant="outline" className="mb-4">PMS Integration Hub</Badge>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light tracking-tight mb-6">
                RoomsOnline vs Traditional Booking Platforms & PMS Comparison
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                Compare Benson, NightsBridge, Cloudbeds and other Property Management Systems 
                seamlessly integrated with RoomsOnline. Live availability, rate fetching, 
                and booking creation capabilities for hotels, B&Bs, and vacation rentals.
              </p>
            </div>
          </div>
        </section>

        {/* What RoomsOnline Is Section */}
        <section className="py-12 sm:py-16">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-5xl mx-auto">
              <h2 className="font-sans text-xl sm:text-2xl font-medium mb-8 text-center">
                What RoomsOnline Is (and Isn't)
              </h2>
              
              <div className="grid md:grid-cols-2 gap-8">
                {/* What it IS */}
                <Card className="border-green-200 dark:border-green-900/50">
                  <CardContent className="pt-6">
                    <h3 className="font-medium text-green-700 dark:text-green-400 mb-4 flex items-center gap-2">
                      <Check className="h-5 w-5" /> What it IS
                    </h3>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3 text-sm">
                        <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>A <strong>unified booking engine</strong> for hotels, B&Bs, lodges, and vacation rentals</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>A <strong>PMS-agnostic orchestration layer</strong> working with Benson, NightsBridge, Cloudbeds, and more</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>A <strong>multi-room, multi-property booking platform</strong> with real-time validation</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>A <strong>single integration point</strong> across multiple PMS systems</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span><strong>PMS-agnostic by design</strong> – switch PMS without changing your booking interface</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                {/* What it IS NOT */}
                <Card className="border-red-200 dark:border-red-900/50">
                  <CardContent className="pt-6">
                    <h3 className="font-medium text-red-700 dark:text-red-400 mb-4 flex items-center gap-2">
                      <X className="h-5 w-5" /> What it is NOT
                    </h3>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3 text-sm">
                        <X className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>Not an <strong>OTA marketplace</strong> – we don't own your inventory or take commission</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <X className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>Not a <strong>channel manager</strong> – we orchestrate, not distribute</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <X className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>Not a <strong>replacement PMS</strong> – your PMS remains the source of truth</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <X className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>Not a system that <strong>owns your inventory</strong> – we defer to the PMS</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Callout */}
              <div className="mt-8 p-6 bg-primary/5 rounded-lg border border-primary/20 text-center">
                <p className="font-display text-lg italic text-primary">
                  "RoomsOnline always defers authority back to the PMS. Always."
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Architecture Philosophy Section */}
        <section className="py-12 sm:py-16 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
              <h2 className="font-sans text-xl sm:text-2xl font-medium mb-8 text-center">
                How RoomsOnline Works: Cache Is Never Authority
              </h2>
              
              <div className="prose prose-lg dark:prose-invert mx-auto mb-8">
                <p className="text-muted-foreground leading-relaxed">
                  Here's something most platforms won't say out loud: <strong>Cached availability is not availability.</strong>
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  RoomsOnline enforces a hard architectural rule: <em>No booking is ever created from cached data alone.</em>
                </p>
              </div>

              {/* Flow Diagram */}
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mb-8 p-6 bg-background rounded-lg border">
                <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-full text-sm">
                  <Users className="h-4 w-4" />
                  Guest Request
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-full text-sm">
                  <Layers className="h-4 w-4" />
                  Cache Display
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  <Shield className="h-4 w-4" />
                  Live PMS Verify
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-full text-sm">
                  <Check className="h-4 w-4" />
                  Booking Created
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-full text-sm">
                  <RefreshCw className="h-4 w-4" />
                  Sync Back
                </div>
              </div>

              <p className="text-center text-muted-foreground">
                It's slower by milliseconds. It's safer by miles.
              </p>
            </div>
          </div>
        </section>

        {/* PMS Comparison Table Section */}
        <section className="py-12 sm:py-16">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-6xl mx-auto">
              <h2 className="font-sans text-xl sm:text-2xl font-medium mb-2 text-center">
                PMS Capabilities Comparison
              </h2>
              <p className="text-muted-foreground text-center mb-8">
                Compare integration capabilities across {getCapabilityCount('liveAvailability')} PMS systems with live availability
              </p>
              
              <PMSComparisonTable />
            </div>
          </div>
        </section>

        {/* Detailed PMS Reviews Section */}
        <section className="py-12 sm:py-16 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
              <h2 className="font-sans text-xl sm:text-2xl font-medium mb-2 text-center">
                Detailed PMS Integration Reviews
              </h2>
              <p className="text-muted-foreground text-center mb-8">
                Click each PMS to see pros, cons, and integration details
              </p>
              
              <PMSDetailAccordion />
            </div>
          </div>
        </section>

        {/* Platform Comparison Section */}
        <section className="py-12 sm:py-16">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-5xl mx-auto">
              <h2 className="font-sans text-xl sm:text-2xl font-medium mb-2 text-center">
                RoomsOnline vs Traditional Platforms
              </h2>
              <p className="text-muted-foreground text-center mb-8">
                How we compare to OTAs and single-PMS booking widgets
              </p>
              
              <PlatformComparisonMatrix />
            </div>
          </div>
        </section>

        {/* Target Audience Section */}
        <section className="py-12 sm:py-16 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-5xl mx-auto">
              <h2 className="font-sans text-xl sm:text-2xl font-medium mb-8 text-center">
                Who RoomsOnline Is For
              </h2>
              
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Hotel className="h-8 w-8 mx-auto mb-3 text-primary" />
                    <h3 className="font-medium mb-2">Hotels</h3>
                    <p className="text-sm text-muted-foreground">Independent hotels in South Africa seeking direct bookings</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <TreePalm className="h-8 w-8 mx-auto mb-3 text-primary" />
                    <h3 className="font-medium mb-2">Lodges</h3>
                    <p className="text-sm text-muted-foreground">Safari lodges and bush properties</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Home className="h-8 w-8 mx-auto mb-3 text-primary" />
                    <h3 className="font-medium mb-2">B&Bs</h3>
                    <p className="text-sm text-muted-foreground">Boutique B&Bs and guest houses</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Building2 className="h-8 w-8 mx-auto mb-3 text-primary" />
                    <h3 className="font-medium mb-2">Portfolios</h3>
                    <p className="text-sm text-muted-foreground">Multi-property operators with mixed PMS</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-12 sm:py-16">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-3xl mx-auto">
              <h2 className="font-sans text-xl sm:text-2xl font-medium mb-8 text-center">
                Frequently Asked Questions
              </h2>
              
              <PMSComparisonFAQ />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-12 sm:py-16 bg-primary/5">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="font-sans text-xl sm:text-2xl font-medium mb-4">
                Ready to Integrate Your PMS?
              </h2>
              <p className="text-muted-foreground mb-8">
                Get in touch to discuss your specific requirements or explore our properties.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                <Button asChild size="lg">
                  <Link to="/contact">
                    <Mail className="h-4 w-4 mr-2" />
                    Contact Sales
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/">
                    View Properties
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center text-sm text-muted-foreground">
                <a href="mailto:info@roomsonline.co.za" className="flex items-center justify-center gap-2 hover:text-foreground transition-colors">
                  <Mail className="h-4 w-4" />
                  info@roomsonline.co.za
                </a>
                <span className="hidden sm:inline">•</span>
                <a href="tel:+27823238115" className="flex items-center justify-center gap-2 hover:text-foreground transition-colors">
                  <Phone className="h-4 w-4" />
                  +27 82 323 8115
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
