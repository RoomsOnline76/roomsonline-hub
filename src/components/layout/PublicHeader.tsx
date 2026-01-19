import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencySelector } from "@/components/CurrencySelector";
import { useState } from "react";
import { cn } from "@/lib/utils";
import rolLogo from "@/assets/rol-logo.png";

interface PublicHeaderProps {
  backLabel?: string;
  backTo?: string;
  transparent?: boolean;
  showCurrency?: boolean;
  className?: string;
}

export function PublicHeader({
  backLabel = "Back",
  backTo = "/",
  transparent = false,
  showCurrency = true,
  className,
}: PublicHeaderProps) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        transparent
          ? "bg-transparent"
          : "bg-background/95 backdrop-blur-sm border-b border-border",
        className
      )}
    >
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Left: Back button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(backTo)}
            className={cn(
              "gap-2 font-normal",
              transparent && "text-white hover:bg-white/10"
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{backLabel}</span>
          </Button>

          {/* Center: Logo */}
          <Link to="/" className="absolute left-1/2 -translate-x-1/2">
            <div className="flex flex-col items-center">
              <img
                src={rolLogo}
                alt="RoomsOnline"
                className="h-8 sm:h-10 w-auto"
              />
              <span
                className={cn(
                  "text-[10px] tracking-widest uppercase mt-0.5 hidden sm:block",
                  transparent ? "text-white/70" : "text-muted-foreground"
                )}
              >
                Rooms done Right
              </span>
            </div>
          </Link>

          {/* Right: Desktop Nav + Currency + Mobile Menu */}
          <div className="flex items-center gap-4">
            {/* Desktop navigation links */}
            <nav className="hidden sm:flex items-center gap-1">
              <Link
                to="/journals"
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  transparent 
                    ? "text-white/90 hover:text-white hover:bg-transparent" 
                    : "text-foreground/80 hover:text-foreground hover:bg-muted"
                )}
              >
                Journal
              </Link>
              <Link
                to="/about"
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  transparent 
                    ? "text-white/90 hover:text-white hover:bg-transparent" 
                    : "text-foreground/80 hover:text-foreground hover:bg-muted"
                )}
              >
                About
              </Link>
              <Link
                to="/compare-property-management-systems"
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  transparent 
                    ? "text-white/90 hover:text-white hover:bg-transparent" 
                    : "text-foreground/80 hover:text-foreground hover:bg-muted"
                )}
              >
                Compare PMS
              </Link>
              <Link
                to="/contact"
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  transparent 
                    ? "text-white/90 hover:text-white hover:bg-transparent" 
                    : "text-foreground/80 hover:text-foreground hover:bg-muted"
                )}
              >
                Contact
              </Link>
            </nav>

            {showCurrency && (
              <div className="hidden sm:block">
                <CurrencySelector
                  compact
                  variant={transparent ? "hero" : "default"}
                />
              </div>
            )}

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "sm:hidden",
                transparent && "text-white hover:bg-white/10"
              )}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden mt-4 pb-2 animate-fade-in bg-background rounded-lg border border-border shadow-lg">
            <nav className="flex flex-col gap-1 p-2">
              <Link
                to="/journals"
                className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-md transition-colors text-foreground/80 hover:text-foreground hover:bg-muted"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="w-5 h-5 flex items-center justify-center text-muted-foreground">📖</span>
                Journal
              </Link>
              <Link
                to="/about"
                className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-md transition-colors text-foreground/80 hover:text-foreground hover:bg-muted"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="w-5 h-5 flex items-center justify-center text-muted-foreground">👥</span>
                About Us
              </Link>
              <Link
                to="/compare-property-management-systems"
                className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-md transition-colors text-foreground/80 hover:text-foreground hover:bg-muted"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="w-5 h-5 flex items-center justify-center text-muted-foreground">⚖️</span>
                Compare PMS
              </Link>
              <Link
                to="/privacy"
                className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-md transition-colors text-foreground/80 hover:text-foreground hover:bg-muted"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="w-5 h-5 flex items-center justify-center text-muted-foreground">🔒</span>
                Privacy
              </Link>
              <Link
                to="/terms"
                className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-md transition-colors text-foreground/80 hover:text-foreground hover:bg-muted"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="w-5 h-5 flex items-center justify-center text-muted-foreground">📋</span>
                Terms
              </Link>
              <Link
                to="/contact"
                className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-md transition-colors text-foreground/80 hover:text-foreground hover:bg-muted"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="w-5 h-5 flex items-center justify-center text-muted-foreground">✉️</span>
                Contact Us
              </Link>
              {showCurrency && (
                <div className="px-3 py-2 border-t border-border mt-1 pt-2">
                  <CurrencySelector compact variant="default" />
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
