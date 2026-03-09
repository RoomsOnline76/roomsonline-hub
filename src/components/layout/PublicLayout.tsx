import { ReactNode } from "react";
import { PublicHeader } from "./PublicHeader";
import { PublicFooter } from "./PublicFooter";
import { JourneyBuilder } from "@/components/journey";
import { cn } from "@/lib/utils";

interface PublicLayoutProps {
  children: ReactNode;
  backLabel?: string;
  backTo?: string;
  transparentHeader?: boolean;
  showCurrency?: boolean;
  hideHeader?: boolean;
  hideFooter?: boolean;
  hideJourneyBuilder?: boolean;
  className?: string;
  contentClassName?: string;
}

export function PublicLayout({
  children,
  backLabel,
  backTo,
  transparentHeader = false,
  showCurrency = true,
  hideHeader = false,
  hideFooter = false,
  hideJourneyBuilder = false,
  className,
  contentClassName,
}: PublicLayoutProps) {
  return (
    <div className={cn("min-h-screen flex flex-col bg-background", className)}>
      {/* Skip to content — WCAG 2.1 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg focus:outline-none"
      >
        Skip to content
      </a>
      {!hideHeader && (
        <PublicHeader
          backLabel={backLabel}
          backTo={backTo}
          transparent={transparentHeader}
          showCurrency={showCurrency}
        />
      )}

      <main
        id="main-content"
        className={cn(
          "flex-1 animate-fade-in",
          contentClassName
        )}
      >
        {children}
      </main>

      {!hideFooter && <PublicFooter />}
      
      {/* Floating Journey Builder */}
      {!hideJourneyBuilder && <JourneyBuilder />}
    </div>
  );
}
