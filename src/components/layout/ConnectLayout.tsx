import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectTobiWidget } from "@/components/connect/ConnectTobiWidget";
import { cn } from "@/lib/utils";
import { connectPath } from "@/lib/config";
import rolWreathLogo from "@/assets/rol-wreath-logo.jpg";

const NAV_LINKS = [
  { label: "Features", href: connectPath("/connect/features") },
  { label: "Integrations", href: connectPath("/connect/integrations") },
  { label: "HubSpot CRM", href: connectPath("/connect/hubspot") },
  { label: "Pricing", href: connectPath("/connect/pricing") },
  { label: "Docs", href: connectPath("/connect/docs") },
  { label: "FAQ", href: connectPath("/connect/faq") },
];

export function ConnectLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link to={connectPath("/connect")} className="flex items-center gap-2.5 shrink-0">
            <img src={rolWreathLogo} alt="ROL'OS" className="h-9 w-9 object-contain rounded-lg" />
            <span className="font-semibold text-lg tracking-tight hidden sm:block">
              ROL'OS <span className="text-muted-foreground font-normal">Connect</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  location.pathname === link.href || location.pathname.startsWith(link.href + "/")
                    ? "text-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* CTAs */}
          <div className="flex items-center gap-2">
            <Link to={connectPath("/connect/get-started")} className="hidden sm:block">
              <Button size="sm" className="font-medium">
                Get Started
              </Button>
            </Link>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-md hover:bg-muted"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t bg-background px-4 pb-4 pt-2 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <nav className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "px-3 py-3 text-base font-medium rounded-md transition-colors",
                    location.pathname === link.href
                      ? "text-primary bg-primary/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <Link to={connectPath("/connect/get-started")} onClick={() => setMobileOpen(false)} className="mt-3">
                <Button className="w-full h-11 font-medium">Get Started</Button>
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* ─── Main content ──────────────────────────────────────── */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ─── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h4 className="font-semibold text-sm mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to={connectPath("/connect/features")} className="hover:text-foreground transition-colors">Features</Link></li>
                <li><Link to={connectPath("/connect/pricing")} className="hover:text-foreground transition-colors">Pricing</Link></li>
                <li><Link to={connectPath("/connect/integrations")} className="hover:text-foreground transition-colors">Integrations</Link></li>
                <li><Link to={connectPath("/connect/hubspot")} className="hover:text-foreground transition-colors">HubSpot CRM</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Developers</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to={connectPath("/connect/docs")} className="hover:text-foreground transition-colors">API Reference</Link></li>
                <li><Link to={connectPath("/connect/docs/quickstart")} className="hover:text-foreground transition-colors">Quickstart</Link></li>
                <li><Link to={connectPath("/connect/docs/wordpress")} className="hover:text-foreground transition-colors">WordPress Plugin</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to={connectPath("/connect/about")} className="hover:text-foreground transition-colors">About</Link></li>
                <li><Link to={connectPath("/connect/get-started")} className="hover:text-foreground transition-colors">Contact</Link></li>
                <li><Link to={connectPath("/connect/journal")} className="hover:text-foreground transition-colors">Journal</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to={connectPath("/connect/privacy-policy")} className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link to={connectPath("/connect/terms-of-service")} className="hover:text-foreground transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Rooms Online. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground">
              connect@roomsonline.co.za
            </p>
          </div>
        </div>
      </footer>

      {/* ─── TOBI floating widget ──────────────────────────────── */}
      <ConnectTobiWidget />
    </div>
  );
}
