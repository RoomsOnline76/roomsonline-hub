import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { usePropertyOnboarding } from "@/hooks/usePropertyOnboarding";
import { WIZARD_SECTIONS, getScoreBand } from "@/config/onboardingFieldSchema";

import { StepPropertyIdentity } from "./steps/StepPropertyIdentity";
import { StepContactDetails } from "./steps/StepContactDetails";
import { StepLocation } from "./steps/StepLocation";
import { StepPoliciesPricing } from "./steps/StepPoliciesPricing";
import { StepGuestExperience } from "./steps/StepGuestExperience";
import { StepFacilities } from "./steps/StepFacilities";
import { StepRoomsOverview } from "./steps/StepRoomsOverview";
import { StepMediaDocuments } from "./steps/StepMediaDocuments";
import { StepReviewSubmit } from "./steps/StepReviewSubmit";

export interface PropertyOnboardingWizardProps {
  propertyId: string;
  mode: 'fullscreen' | 'embedded';
  ownerEmail?: string;
  onComplete?: () => void;
  onClose?: () => void;
}

const STEP_COMPONENTS = [
  StepPropertyIdentity,
  StepContactDetails,
  StepLocation,
  StepPoliciesPricing,
  StepGuestExperience,
  StepFacilities,
  StepRoomsOverview,
  StepMediaDocuments,
  StepReviewSubmit
];

export function PropertyOnboardingWizard({ propertyId, mode, ownerEmail, onComplete, onClose }: PropertyOnboardingWizardProps) {
  const {
    currentStep, propertyData, isLoading, isSaving, lastSavedAt, completionPercent, score, scoreBand,
    updateField, isPMSManaged, goToStep, nextStep, prevStep, getAmenityValue
  } = usePropertyOnboarding(propertyId, ownerEmail);

  const CurrentStepComponent = STEP_COMPONENTS[currentStep];
  const currentSection = WIZARD_SECTIONS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === WIZARD_SECTIONS.length - 1;

  useEffect(() => {
    if (mode === 'fullscreen') {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [mode]);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center", mode === 'fullscreen' ? "fixed inset-0 bg-background z-50" : "min-h-[400px]")}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!propertyData) {
    return (
      <div className={cn("flex items-center justify-center", mode === 'fullscreen' ? "fixed inset-0 bg-background z-50" : "min-h-[400px]")}>
        <div className="text-center p-6">
          <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-semibold">Property Not Found</h2>
          {onClose && <Button onClick={onClose} variant="outline" className="mt-4">Go Back</Button>}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col bg-background", mode === 'fullscreen' && "fixed inset-0 z-50")}>
      {/* Header */}
      <header className="flex-shrink-0 border-b bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {onClose && <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="h-4 w-4" /></Button>}
            <h1 className="hidden sm:block text-lg font-semibold truncate max-w-[200px]">{propertyData.name || "Property Onboarding"}</h1>
          </div>

          <span className="sm:hidden text-sm font-medium">Step {currentStep + 1}/{WIZARD_SECTIONS.length}</span>

          <div className="flex items-center gap-3">
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : lastSavedAt && <Check className="h-3 w-3 text-green-500" />}
            <div className={cn("hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-muted", scoreBand.color)}>
              {score}%
            </div>
          </div>
        </div>

        <div className="px-4 pb-3">
          <Progress value={completionPercent} className="h-2" />
          <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
            <span>{completionPercent}% complete</span>
            <span className="hidden sm:inline">{currentSection?.title}</span>
          </div>
        </div>

        <nav className="hidden lg:flex items-center justify-center border-t py-2 px-4 gap-2">
          {currentStep > 0 && (
            <>
              <button onClick={() => goToStep(currentStep - 1)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">{WIZARD_SECTIONS[currentStep - 1].title}</button>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            </>
          )}
          <span className="px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-full">{currentSection?.title}</span>
          {currentStep < WIZARD_SECTIONS.length - 1 && (
            <>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              <button onClick={() => goToStep(currentStep + 1)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">{WIZARD_SECTIONS[currentStep + 1].title}</button>
            </>
          )}
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <AnimatePresence mode="wait">
            <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">{currentSection?.title}</h2>
                <p className="text-sm text-muted-foreground">{currentSection?.description}</p>
              </div>
              {CurrentStepComponent && (
                <CurrentStepComponent propertyData={propertyData} updateField={updateField} isPMSManaged={isPMSManaged} getAmenityValue={getAmenityValue} onComplete={onComplete} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="outline" onClick={prevStep} disabled={isFirstStep} className="gap-1.5">
            <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Previous</span>
          </Button>
          <div className="flex gap-1 sm:hidden">
            {WIZARD_SECTIONS.slice(0, 9).map((_, i) => (
              <div key={i} className={cn("w-2 h-2 rounded-full", i === currentStep ? "bg-primary" : i < currentStep ? "bg-primary/40" : "bg-muted")} />
            ))}
          </div>
          <Button onClick={isLastStep ? onComplete : nextStep} className="gap-1.5">
            <span>{isLastStep ? "Complete" : "Next"}</span>
            {!isLastStep && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </footer>
    </div>
  );
}
