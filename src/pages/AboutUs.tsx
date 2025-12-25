import { Link } from "react-router-dom";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const AboutUs = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="h-9 w-9 rounded-lg bg-[var(--hero-gradient)] flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">RoomsOnline</h1>
              <p className="text-xs text-muted-foreground">Unified Booking Engine</p>
            </div>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <article className="prose prose-lg dark:prose-invert max-w-none">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-8">About RoomsOnline</h1>
          
          <p className="text-muted-foreground leading-relaxed">
            RoomsOnline is a curated accommodation booking platform designed to make finding the right place to stay simpler, calmer, and more meaningful. We connect travellers with carefully selected hotels, lodges, guesthouses, villas, and retreats, while providing real-time availability and secure online booking.
          </p>
          
          <p className="text-muted-foreground leading-relaxed">
            Unlike traditional booking sites that overwhelm users with endless listings and aggressive sales tactics, RoomsOnline focuses on quality over quantity. Every property featured on our platform is chosen for its character, location, atmosphere, and the experience it offers — not just its price or star rating.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">A More Thoughtful Way to Book Accommodation</h2>
          
          <p className="text-muted-foreground leading-relaxed">
            RoomsOnline was created to solve a common problem: booking accommodation often feels stressful, confusing, and rushed. Too many options, too many filters, and too little context make it hard to feel confident in your choice.
          </p>
          
          <p className="text-muted-foreground leading-relaxed">
            We take a different approach. Our platform allows guests to browse by destination, vibe, and travel intent — whether that's a romantic escape, a foodie weekend, a family holiday, or a chance to recharge. Editorial insights such as "Why we chose this place" and "Who this suits" help travellers decide with clarity, not pressure.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Curated Properties With Real-Time Availability</h2>
          
          <p className="text-muted-foreground leading-relaxed">
            RoomsOnline integrates directly with trusted property management systems to provide accurate pricing and live availability. This means guests can book with confidence, knowing the information they see is up to date.
          </p>
          
          <p className="text-muted-foreground leading-relaxed">
            For property owners, RoomsOnline offers a flexible booking engine that works alongside existing systems rather than replacing them. Our technology supports multi-room bookings, complex rate structures, and real-world operational needs — without forcing properties into a rigid template.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Designed for Experience-Driven Travel</h2>
          
          <p className="text-muted-foreground leading-relaxed">
            RoomsOnline is built for travellers who care about experience, not just accommodation. Whether you're searching for a secluded retreat, a design-led city stay, a nature-based escape, or a bucket-list destination, our platform is designed to help you discover places that feel right.
          </p>
          
          <p className="text-muted-foreground leading-relaxed">
            Instead of star ratings and generic reviews, we use an editorial rating system that reflects the individuality and quality of each property. This creates a more honest, human way to compare and explore accommodation options.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Built on Reliable Technology, Guided by Human Curation</h2>
          
          <p className="text-muted-foreground leading-relaxed">
            Behind the scenes, RoomsOnline is a secure and scalable booking platform built to modern standards. On the surface, it is intentionally calm, uncluttered, and easy to use. Maps guide rather than overwhelm, filters are experience-based rather than technical, and browsing always comes before booking.
          </p>
          
          <p className="text-muted-foreground leading-relaxed">
            Our goal is not to push travellers to book faster. It is to help them book better.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Who RoomsOnline Is For</h2>
          
          <p className="text-muted-foreground leading-relaxed">
            RoomsOnline is for travellers looking for memorable stays, not commodity accommodation. It's for couples, families, solo travellers, and groups who value atmosphere, authenticity, and thoughtful design.
          </p>
          
          <p className="text-muted-foreground leading-relaxed">
            It's also for independent accommodation providers who want their properties presented with care and context, alongside other high-quality places that share similar values.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">Book With Confidence</h2>
          
          <p className="text-muted-foreground leading-relaxed">
            RoomsOnline is where considered curation meets reliable booking technology. Every stay is chosen with intention, every booking supported by live data, and every experience designed to inspire confidence from the first click to check-in.
          </p>
        </article>

        {/* Back Button */}
        <div className="mt-12 pt-8 border-t border-border">
          <Button variant="outline" asChild>
            <Link to="/" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
};

export default AboutUs;
