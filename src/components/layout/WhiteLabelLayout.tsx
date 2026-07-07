import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";
import { JourneyBuilder } from "@/components/journey";

interface WhiteLabelLayoutProps {
  children: ReactNode;
  propertyName?: string;
  propertyLogoUrl?: string | null;
  className?: string;
  /**
   * Full white-label mode: hides the "Powered by ROL'OS" footer and the
   * floating JourneyBuilder so the page is indistinguishable from the
   * property's own site. Set by pages when `?wl=1` is present in the URL.
   */
  hideRolBranding?: boolean;
}

/**
 * A minimal layout for integration-originated booking flows.
 * Shows only the property's logo + name in the header,
 * and a subtle "Powered by ROL'OS" in the footer.
 * No ROL branding, no nav links, no footer links.
 */
export function WhiteLabelLayout({
  children,
  propertyName,
  propertyLogoUrl,
  className,
  hideRolBranding = false,
}: WhiteLabelLayoutProps) {
  return (
    <div className={cn("min-h-screen flex flex-col bg-background", className)}>
      {/* Minimal branded header */}
      {propertyName && (
        <header className="border-b border-border/50 bg-background">
          <div className="container mx-auto px-4 py-3 flex items-center gap-3">
            {propertyLogoUrl && (
              <img
                src={propertyLogoUrl}
                alt={propertyName}
                className="h-8 w-auto object-contain"
              />
            )}
            <span className="font-semibold text-foreground text-sm sm:text-base truncate">
              {propertyName}
            </span>
          </div>
        </header>
      )}

      <main className="flex-1 animate-fade-in">
        {children}
      </main>

      {/* Minimal footer — hidden entirely in full white-label mode */}
      {!hideRolBranding && (
        <footer className="border-t border-border/30 py-4">
          <PoweredByRolOS />
        </footer>
      )}

      {/* Floating Journey Builder — omitted in full white-label mode */}
      {!hideRolBranding && <JourneyBuilder />}
    </div>
  );
}
