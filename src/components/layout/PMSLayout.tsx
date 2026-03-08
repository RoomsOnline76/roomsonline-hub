import { ReactNode, useEffect, useState } from "react";
import { PMSSidebar } from "./PMSSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { HelpProvider } from "@/contexts/HelpContext";
import { FloatingHelpButton } from "@/components/help";
import { PMSHelpDrawer } from "@/components/pms/PMSHelpDrawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { supabase } from "@/integrations/supabase/client";

interface PMSLayoutProps {
  children: ReactNode;
}

export function PMSLayout({ children }: PMSLayoutProps) {
  const isMobile = useIsMobile();
  const { propertyId } = usePmsPropertyId();
  const [propertyName, setPropertyName] = useState<string | undefined>();

  useEffect(() => {
    if (!propertyId) {
      setPropertyName(undefined);
      return;
    }
    supabase
      .from("properties")
      .select("name")
      .eq("id", propertyId)
      .single()
      .then(({ data }) => {
        setPropertyName(data?.name || undefined);
      });
  }, [propertyId]);

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
      <PMSHelpDrawer propertyName={propertyName} />
      <FloatingHelpButton />
    </HelpProvider>
  );
}
