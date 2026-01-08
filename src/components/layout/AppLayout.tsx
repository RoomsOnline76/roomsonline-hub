import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { HelpProvider } from "@/contexts/HelpContext";
import { HelpDrawer, FloatingHelpButton } from "@/components/help";
import { OwnerOnboardingWizard } from "@/components/onboarding";
import { useOwnerOnboarding } from "@/hooks/useOwnerOnboarding";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { pendingCredentials, showOnboarding, completeOnboarding, skipOnboarding } = useOwnerOnboarding();

  return (
    <HelpProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto px-6 py-6 max-w-7xl animate-fade-in">
            {children}
          </div>
        </main>
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
