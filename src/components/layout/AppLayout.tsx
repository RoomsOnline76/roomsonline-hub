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
        {/* Skip to content — WCAG 2.1 */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg focus:outline-none"
        >
          Skip to content
        </a>
        {!isMobile && <AppSidebar />}
        <main id="main-content" className={`flex-1 overflow-auto ${isMobile ? 'pb-20' : ''}`}>
          <div className="w-full mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 max-w-[2000px] animate-fade-in">
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
