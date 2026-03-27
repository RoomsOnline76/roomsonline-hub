import { PublicLayout } from "@/components/layout/PublicLayout";
import { PublicBreadcrumb } from "@/components/layout/PublicBreadcrumb";
import { usePageSEO } from "@/hooks/usePageSEO";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const AboutUs = () => {
  usePageSEO({
    title: "About RoomsOnline — Curating Extraordinary Stays",
    description: "RoomsOnline connects discerning travelers with extraordinary accommodations across Africa. Hand-picked safari lodges, boutique hotels, and luxury retreats since 2010.",
    ogType: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "RoomsOnline",
      alternateName: "Sleep in Africa",
      url: "https://book.sleepinafrica.roomsonline.co.za",
      foundingDate: "2010",
      description: "Curating extraordinary stays across Africa since 2010.",
      contactPoint: {
        "@type": "ContactPoint",
        email: "hello@roomsonline.co.za",
        contactType: "customer service",
      },
    },
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "About", url: "/about" },
    ],
  });

  return (
    <PublicLayout backLabel="Back to Home" backTo="/">
      <PublicBreadcrumb items={[{ label: "About" }]} />
      <div className="container mx-auto px-4 sm:px-6 py-16 sm:py-20">
        {/* Page title */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="font-display text-3xl sm:text-4xl font-light tracking-tight leading-tight text-foreground mb-4">
            About RoomsOnline
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Curating extraordinary stays since 2010
          </p>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto space-y-12">
          {/* Mission section */}
          <section className="space-y-6">
            <h2 className="font-sans text-xl sm:text-2xl font-medium tracking-tight leading-tight text-foreground">
              Our Mission
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              At RoomsOnline, we believe that where you stay shapes how you experience the world. 
              Our mission is to connect discerning travelers with extraordinary accommodations that 
              tell a story—places that inspire, comfort, and create lasting memories.
            </p>
            
            {/* Pull quote */}
            <blockquote className="border-l-2 border-muted-foreground/30 pl-6 py-2 my-8">
              <p className="font-display text-lg italic text-foreground/90 leading-relaxed">
                "Every property we feature has been personally visited and thoughtfully 
                evaluated against our exacting standards."
              </p>
            </blockquote>
          </section>

          {/* What we do section */}
          <section className="space-y-6">
            <h2 className="font-sans text-xl sm:text-2xl font-medium tracking-tight leading-tight text-foreground">
              What We Do
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              We curate a collection of boutique hotels, luxury lodges, historic estates, 
              and unique retreats across Southern Africa and beyond. Each property in our 
              portfolio is hand-selected for its character, service excellence, and ability 
              to deliver unforgettable experiences.
            </p>
            <p className="text-foreground/80 leading-relaxed">
              Our editorial team provides honest, nuanced assessments of every property—
              including who each place is perfect for, and equally importantly, who it 
              might not suit. We believe in transparency and helping travelers find their 
              ideal match.
            </p>
          </section>

          {/* A more thoughtful way section */}
          <section className="space-y-6">
            <h2 className="font-sans text-xl sm:text-2xl font-medium tracking-tight leading-tight text-foreground">
              A More Thoughtful Way to Book
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              RoomsOnline was created to solve a common problem: booking accommodation often 
              feels stressful, confusing, and rushed. Too many options, too many filters, and 
              too little context make it hard to feel confident in your choice.
            </p>
            <p className="text-foreground/80 leading-relaxed">
              We take a different approach. Our platform allows guests to browse by destination, 
              vibe, and travel intent—whether that is a romantic escape, a foodie weekend, a 
              family holiday, or a chance to recharge. Editorial insights such as "Why we chose 
              this place" and "Who this suits" help travelers decide with clarity, not pressure.
            </p>
          </section>

          {/* Our approach section */}
          <section className="space-y-6">
            <h2 className="font-sans text-xl sm:text-2xl font-medium tracking-tight leading-tight text-foreground">
              Our Approach
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-6 rounded-lg bg-card border border-border hover:border-primary/20 transition-colors duration-200">
                <h3 className="font-medium text-foreground mb-2">Curated</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Every property is personally vetted—no pay-to-play, no algorithmic rankings.
                </p>
              </div>
              <div className="p-6 rounded-lg bg-card border border-border hover:border-primary/20 transition-colors duration-200">
                <h3 className="font-medium text-foreground mb-2">Honest</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Our editorial ratings reflect genuine assessment, including candid caveats.
                </p>
              </div>
              <div className="p-6 rounded-lg bg-card border border-border hover:border-primary/20 transition-colors duration-200">
                <h3 className="font-medium text-foreground mb-2">Seamless</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Real-time availability and instant booking—no waiting, no uncertainty.
                </p>
              </div>
            </div>
          </section>

          {/* Who we are for */}
          <section className="space-y-6">
            <h2 className="font-sans text-xl sm:text-2xl font-medium tracking-tight leading-tight text-foreground">
              Who RoomsOnline Is For
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              RoomsOnline is for travelers looking for memorable stays, not commodity 
              accommodation. It is for couples, families, solo travelers, and groups who 
              value atmosphere, authenticity, and thoughtful design.
            </p>
            <p className="text-foreground/80 leading-relaxed">
              It is also for independent accommodation providers who want their properties 
              presented with care and context, alongside other high-quality places that 
              share similar values.
            </p>
          </section>

          {/* Contact prompt */}
          <section className="text-center pt-16 border-t border-border">
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Have questions or want to learn more?
            </p>
            <Button asChild size="lg" className="text-lg px-8 py-6 gap-2">
              <a href="/contact">
                Get in Touch
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
};

export default AboutUs;
