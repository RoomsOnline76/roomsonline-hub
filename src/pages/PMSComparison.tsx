import { useEffect } from "react";
import { Link } from "react-router-dom";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { 
  Layers, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  Building2, 
  Users, 
  Globe, 
  CreditCard,
  HelpCircle,
  Mail,
  Phone
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// FAQ data for JSON-LD schema
const faqData = [
  {
    question: "Do I need to change PMS?",
    answer: "No. We sit on top of what you already use. Your existing Property Management System remains the source of truth for all inventory and bookings."
  },
  {
    question: "Can different properties use different systems?",
    answer: "Yes. Each property can run on its own PMS. Sleep in Africa by ROL connects them all into one unified booking experience for your guests."
  },
  {
    question: "Who processes payments?",
    answer: "Payments are handled via your chosen, fully PCI-compliant payment gateway. We integrate with leading payment providers to ensure secure transactions."
  },
  {
    question: "Is there a contract or lock-in?",
    answer: "No. This is pay-per-performance only. There are no setup fees, monthly licenses, or long-term commitments."
  }
];

// JSON-LD Schema for FAQ
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": faqData.map(item => ({
    "@type": "Question",
    "name": item.question,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": item.answer
    }
  }))
};

// JSON-LD Schema for SoftwareApplication
const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Sleep in Africa by ROL",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "description": "A unified booking layer that connects any PMS or channel manager into one seamless booking experience on your website.",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "ZAR",
    "description": "Pay-per-performance model with no setup fees or monthly licenses"
  },
  "featureList": [
    "PMS-agnostic booking engine",
    "Real-time availability and rates",
    "Multi-property portfolio support",
    "Unified checkout experience",
    "Automatic booking routing to correct PMS",
    "Secure payment processing"
  ]
};

export default function PMSComparison() {
  // Set page meta and JSON-LD
  useEffect(() => {
    document.title = "Unified Booking Layer for Property Portfolios | Sleep in Africa by ROL";
    
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Connect any PMS to one website. Sleep in Africa by ROL is a unified booking layer that works with your existing property management systems. No migrations, no replacements.');
    }
    
    // Add FAQ schema
    const faqScript = document.createElement('script');
    faqScript.type = 'application/ld+json';
    faqScript.text = JSON.stringify(faqSchema);
    faqScript.id = 'faq-schema';
    document.head.appendChild(faqScript);
    
    // Add Software schema
    const softwareScript = document.createElement('script');
    softwareScript.type = 'application/ld+json';
    softwareScript.text = JSON.stringify(softwareSchema);
    softwareScript.id = 'software-schema';
    document.head.appendChild(softwareScript);
    
    return () => {
      const faqEl = document.getElementById('faq-schema');
      const softwareEl = document.getElementById('software-schema');
      if (faqEl) document.head.removeChild(faqEl);
      if (softwareEl) document.head.removeChild(softwareEl);
    };
  }, []);

  return (
    <PublicLayout>
      <article className="min-h-screen">
        {/* Hero Section */}
        <section className="relative bg-gradient-to-b from-primary/5 to-background py-16 sm:py-24 lg:py-32">
          <div className="container max-w-4xl mx-auto px-4 text-center">
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-medium tracking-tight leading-tight text-foreground mb-6">
              Connect Any PMS.<br />
              <span className="text-primary">One Website. One Checkout.</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-8">
              Managing multiple properties with different Property Management Systems shouldn't mean 
              fragmented bookings, multiple websites, or lost direct revenue.
            </p>
            
            <p className="text-lg text-foreground leading-relaxed max-w-2xl mx-auto mb-8">
              <strong>Sleep in Africa by ROL</strong> is a <strong>unified booking layer</strong> that connects any PMS or channel manager 
              into one seamless booking experience on your website.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-muted-foreground mb-10">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                No migrations
              </span>
              <span className="hidden sm:inline text-border">•</span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                No system replacements
              </span>
              <span className="hidden sm:inline text-border">•</span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Just one place for guests to book
              </span>
            </div>
            
            <Button asChild size="lg" className="px-8">
              <Link to="/contact">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        {/* What We're Building */}
        <section className="py-12 sm:py-16 bg-background">
          <div className="container max-w-3xl mx-auto px-4">
            <h2 className="font-sans font-medium text-2xl sm:text-3xl text-foreground mb-6">
              What We're Building
            </h2>
            
            <div className="prose prose-lg max-w-none text-muted-foreground space-y-4">
              <p>
                Most property portfolios don't run on a single system.
              </p>
              <p>
                Different properties often use different PMS platforms, channel managers, or booking tools — 
                especially in growing or regional operations.
              </p>
              <p className="text-foreground font-medium">
                Guests don't care about that complexity. They just want to search, compare, and book.
              </p>
              <p>
                Sleep in Africa by ROL connects all of your existing systems into a single booking experience on your website. 
                We sit on top of your current PMS and channel managers and turn them into one unified storefront.
              </p>
              <p>
                Think of us as the <strong>translation layer</strong> between your technology stack and your guests.
              </p>
            </div>
          </div>
        </section>

        {/* The Problem We Solve */}
        <section className="py-12 sm:py-16 bg-muted/30">
          <div className="container max-w-3xl mx-auto px-4">
            <h2 className="font-sans font-medium text-2xl sm:text-3xl text-foreground mb-6">
              The Problem We Solve
            </h2>
            
            <p className="text-muted-foreground mb-6">Without a unified layer:</p>
            
            <ul className="space-y-3 mb-8">
              {[
                "Guests are redirected to third-party booking pages",
                "Each property behaves differently",
                "Direct bookings are lost to OTAs",
                "Reporting is fragmented",
                "Brand experience breaks"
              ].map((problem, index) => (
                <li key={index} className="flex items-start gap-3 text-muted-foreground">
                  <XCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <span>{problem}</span>
                </li>
              ))}
            </ul>
            
            <p className="text-foreground font-medium">
              Sleep in Africa by ROL removes that friction by creating one consistent booking flow across your 
              entire portfolio — regardless of what systems run underneath.
            </p>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-12 sm:py-16 bg-background">
          <div className="container max-w-3xl mx-auto px-4">
            <h2 className="font-sans font-medium text-2xl sm:text-3xl text-foreground mb-8">
              How It Works
            </h2>
            
            <ol className="space-y-4 mb-8">
              {[
                "Each property connects using its existing PMS or channel manager",
                "Sleep in Africa by ROL pulls real-time availability and rates",
                "Guests search and compare all properties in one place",
                "One checkout is completed on your website",
                "The booking is automatically routed back to the correct PMS",
                "Payments are processed securely",
                "All bookings are tracked in one dashboard"
              ].map((step, index) => (
                <li key={index} className="flex items-start gap-4">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary font-medium flex items-center justify-center text-sm">
                    {index + 1}
                  </span>
                  <span className="text-muted-foreground pt-1">{step}</span>
                </li>
              ))}
            </ol>
            
            <div className="bg-muted/50 rounded-lg p-6 border border-border">
              <p className="text-foreground font-medium mb-2">Your operations stay exactly as they are.</p>
              <p className="text-muted-foreground">Your guests see one clean experience.</p>
            </div>
          </div>
        </section>

        {/* Who It's Built For */}
        <section className="py-12 sm:py-16 bg-muted/30">
          <div className="container max-w-3xl mx-auto px-4">
            <h2 className="font-sans font-medium text-2xl sm:text-3xl text-foreground mb-6">
              Who It's Built For
            </h2>
            
            <p className="text-muted-foreground mb-6">
              Sleep in Africa by ROL is designed for teams who manage complexity. It's ideal for:
            </p>
            
            <ul className="space-y-3 mb-8">
              {[
                { icon: Building2, text: "Property management companies with mixed PMS systems" },
                { icon: Globe, text: "Hospitality groups managing multiple brands or regions" },
                { icon: Users, text: "Agencies representing different property owners" },
                { icon: Layers, text: "Portfolios transitioning between PMS platforms" },
                { icon: CreditCard, text: "Operators who want more direct bookings without rebuilding everything" }
              ].map((item, index) => (
                <li key={index} className="flex items-start gap-3 text-muted-foreground">
                  <item.icon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
            
            <p className="text-foreground font-medium">
              If your portfolio runs on different systems, this platform was built for you.
            </p>
          </div>
        </section>

        {/* What We Don't Do */}
        <section className="py-12 sm:py-16 bg-background">
          <div className="container max-w-3xl mx-auto px-4">
            <h2 className="font-sans font-medium text-2xl sm:text-3xl text-foreground mb-6">
              What We Don't Do
            </h2>
            
            <p className="text-muted-foreground mb-6">We are intentionally not:</p>
            
            <ul className="space-y-3 mb-8">
              {[
                "A replacement PMS",
                "A channel manager",
                "A revenue management system",
                "A forced migration"
              ].map((item, index) => (
                <li key={index} className="flex items-start gap-3 text-muted-foreground">
                  <XCircle className="h-5 w-5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            
            <p className="text-foreground font-medium">
              Your PMS remains the source of truth. We simply connect everything together.
            </p>
          </div>
        </section>

        {/* Pricing & Commercial Model */}
        <section className="py-12 sm:py-16 bg-muted/30">
          <div className="container max-w-3xl mx-auto px-4">
            <h2 className="font-sans font-medium text-2xl sm:text-3xl text-foreground mb-6">
              Pricing & Commercial Model
            </h2>
            
            <div className="space-y-4 text-muted-foreground mb-8">
              <p>There are no setup fees.</p>
              <p>There are no monthly licenses.</p>
              <p className="text-foreground font-medium">
                Sleep in Africa by ROL operates on a simple pay-per-performance model.
              </p>
              <p>
                A small percentage is charged only on confirmed bookings that originate through our platform.
              </p>
              <p className="text-foreground font-medium">
                If we don't generate revenue for you, you don't pay.
              </p>
            </div>
            
            <div className="bg-background rounded-lg p-6 border border-border">
              <h3 className="font-medium text-foreground mb-3">Transaction Fee</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                A service fee is charged only on confirmed bookings originating through our platform. 
                The fee is calculated as a percentage of the total reservation value and is deducted 
                automatically during settlement. No fees apply to bookings generated outside our software.
              </p>
            </div>
          </div>
        </section>

        {/* Supported Ecosystem */}
        <section className="py-12 sm:py-16 bg-background">
          <div className="container max-w-3xl mx-auto px-4">
            <h2 className="font-sans font-medium text-2xl sm:text-3xl text-foreground mb-6">
              Supported Ecosystem
            </h2>
            
            <p className="text-muted-foreground mb-6">Sleep in Africa by ROL connects with:</p>
            
            <ul className="grid sm:grid-cols-2 gap-3 mb-6">
              {[
                "Major PMS platforms",
                "Leading channel managers",
                "Secure payment gateways",
                "Google Hotel Ads",
                "Meta and social booking links",
                "Custom-built websites"
              ].map((item, index) => (
                <li key={index} className="flex items-center gap-3 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            
            <p className="text-muted-foreground text-sm">
              New integrations are added continuously.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-12 sm:py-16 bg-muted/30">
          <div className="container max-w-3xl mx-auto px-4">
            <h2 className="font-sans font-medium text-2xl sm:text-3xl text-foreground mb-8">
              Frequently Asked Questions
            </h2>
            
            <Accordion type="single" collapsible className="w-full space-y-2">
              {faqData.map((item, index) => (
                <AccordionItem 
                  key={index} 
                  value={`faq-${index}`}
                  className="border border-border rounded-lg px-4 bg-background"
                >
                  <AccordionTrigger className="hover:no-underline text-left">
                    <div className="flex items-start gap-3">
                      <HelpCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="font-medium">{item.question}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2 pb-4 pl-8">
                    <p className="text-muted-foreground leading-relaxed">{item.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 sm:py-24 bg-primary/5">
          <div className="container max-w-3xl mx-auto px-4 text-center">
            <h2 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-foreground mb-6">
              Unify Your Portfolio
            </h2>
            
            <p className="text-lg text-muted-foreground leading-relaxed mb-4 max-w-xl mx-auto">
              Turn your website into your strongest sales channel — regardless of how your 
              properties are managed behind the scenes.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-muted-foreground mb-10">
              <span className="font-medium text-foreground">Connect once.</span>
              <span className="hidden sm:inline text-border">•</span>
              <span className="font-medium text-foreground">Sell everywhere.</span>
            </div>
            
            <Button asChild size="lg" className="px-8 mb-10">
              <Link to="/contact">
                Contact Us
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-muted-foreground">
              <a 
                href="mailto:info@roomsonline.co.za" 
                className="flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <Mail className="h-4 w-4" />
                info@roomsonline.co.za
              </a>
              <a 
                href="tel:+27823238115" 
                className="flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <Phone className="h-4 w-4" />
                +27 82 323 8115
              </a>
            </div>
          </div>
        </section>
      </article>
    </PublicLayout>
  );
}
