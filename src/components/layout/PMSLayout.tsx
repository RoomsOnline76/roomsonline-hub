import { ReactNode } from "react";
import { PMSSidebar } from "./PMSSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { HelpProvider } from "@/contexts/HelpContext";
import { HelpDrawer, FloatingHelpButton } from "@/components/help";
import { useIsMobile } from "@/hooks/use-mobile";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";

interface PMSLayoutProps {
  children: ReactNode;
}

export function PMSLayout({ children }: PMSLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <HelpProvider>
      <div className="flex min-h-screen w-full bg-background">
        {!isMobile && <PMSSidebar />}
        <main className={`flex-1 overflow-auto ${isMobile ? 'pb-20' : ''}`}>
          <div className="w-full mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 max-w-[2000px] animate-fade-in">
            {children}
          </div>
          <footer className="py-3 border-t border-border">
            <PoweredByRolOS />
          </footer>
        </main>
        {isMobile && <MobileBottomNav />}
      </div>
      <HelpDrawer />
      <FloatingHelpButton />
    </HelpProvider>
  );
}
