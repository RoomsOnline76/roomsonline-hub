import { ReactNode } from "react";
import { PublicHeader } from "./PublicHeader";
import { PublicFooter } from "./PublicFooter";
import { cn } from "@/lib/utils";

interface PublicLayoutProps {
  children: ReactNode;
  backLabel?: string;
  backTo?: string;
  transparentHeader?: boolean;
  showCurrency?: boolean;
  hideHeader?: boolean;
  hideFooter?: boolean;
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
  className,
  contentClassName,
}: PublicLayoutProps) {
  return (
    <div className={cn("min-h-screen flex flex-col bg-background", className)}>
      {!hideHeader && (
        <PublicHeader
          backLabel={backLabel}
          backTo={backTo}
          transparent={transparentHeader}
          showCurrency={showCurrency}
        />
      )}

      <main
        className={cn(
          "flex-1 animate-fade-in",
          contentClassName
        )}
      >
        {children}
      </main>

      {!hideFooter && <PublicFooter />}
    </div>
  );
}
