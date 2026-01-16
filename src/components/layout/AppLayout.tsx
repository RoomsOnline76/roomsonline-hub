import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { HelpProvider } from "@/contexts/HelpContext";
import { HelpDrawer, FloatingHelpButton } from "@/components/help";
import { OwnerOnboardingWizard } from "@/components/onboarding";
import { useOwnerOnboarding } from "@/hooks/useOwnerOnboarding";
import { useIsMobile } from "@/hooks/use-mobile";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { pendingCredentials, showOnboarding, completeOnboarding, skipOnboarding } = useOwnerOnboarding();
  const isMobile = useIsMobile();

  return (
    <HelpProvider>
      <div className="flex min-h-screen w-full bg-background">
        {!isMobile && <AppSidebar />}
        <main className={`flex-1 overflow-auto ${isMobile ? 'pb-20' : ''}`}>
          <div className="container mx-auto px-4 md:px-6 py-4 md:py-6 max-w-7xl animate-fade-in">
            {children}
          </div>
        </main>
        {isMobile && <MobileBottomNav />}
      </div>
      <HelpDrawer />
      <FloatingHelpButton />
      <OwnerOnboardingWizard
        open={showOnboarding}
        onComplete={completeOnboarding}
        onSkip={skipOnboarding}
        pendingCredentials={pendingCredentials}
      />
    </HelpProvider>
  );
}
