import { Link } from "react-router-dom";

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-muted/30 mt-auto">
      {/* Accent line */}
      <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Navigation links */}
          <nav aria-label="Footer navigation" className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm">
            <Link
              to="/property_listing"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Properties
            </Link>
            <Link
              to="/how-our-booking-engine-works"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              How It Works
            </Link>
            <Link
              to="/about"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              About
            </Link>
            <Link
              to="/contact"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Contact
            </Link>
            <Link
              to="/journals"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Journal
            </Link>
            <Link
              to="/privacy-policy"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </Link>
            <Link
              to="/terms-of-service"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </Link>
            <Link
              to="/affiliate-disclosure"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Affiliate Disclosure
            </Link>
          </nav>

          {/* Copyright */}
          <p className="text-xs text-muted-foreground">
            © {currentYear} RoomsOnline. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
