import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Save, Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { usePropertyOnboarding } from "@/hooks/usePropertyOnboarding";
import { WIZARD_SECTIONS, getScoreBand } from "@/config/onboardingFieldSchema";

// Import step components
import { StepPropertyIdentity } from "./steps/StepPropertyIdentity";
import { StepContactDetails } from "./steps/StepContactDetails";
import { StepOfferings } from "./steps/StepOfferings";
import { StepLocation } from "./steps/StepLocation";
import { StepPolicies } from "./steps/StepPolicies";
import { StepBanking } from "./steps/StepBanking";
import { StepDescription } from "./steps/StepDescription";
import { StepFacilities } from "./steps/StepFacilities";
import { StepRoomsOverview } from "./steps/StepRoomsOverview";
import { StepMedia } from "./steps/StepMedia";
import { StepReviewSubmit } from "./steps/StepReviewSubmit";

export interface PropertyOnboardingWizardProps {
  propertyId: string;
  mode: 'fullscreen' | 'embedded';
  onComplete?: () => void;
  onClose?: () => void;
}

const STEP_COMPONENTS = [
  StepPropertyIdentity,
  StepContactDetails,
  StepOfferings,
  StepLocation,
  StepPolicies,
  StepBanking,
  StepDescription,
  StepFacilities,
  StepRoomsOverview,
  StepMedia,
  StepReviewSubmit
];

export function PropertyOnboardingWizard({
  propertyId,
  mode,
  onComplete,
  onClose
}: PropertyOnboardingWizardProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  
  const {
    currentStep,
    propertyData,
    isLoading,
    isSaving,
    lastSavedAt,
    completionPercent,
    score,
    scoreBand,
    updateField,
    isPMSManaged,
    goToStep,
    nextStep,
    prevStep,
    getAmenityValue
  } = usePropertyOnboarding(propertyId);

  const CurrentStepComponent = STEP_COMPONENTS[currentStep];
  const currentSection = WIZARD_SECTIONS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === WIZARD_SECTIONS.length - 1;

  // Prevent body scroll in fullscreen mode
  useEffect(() => {
    if (mode === 'fullscreen') {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [mode]);

  if (isLoading) {
    return (
      <div className={cn(
        "flex items-center justify-center",
        mode === 'fullscreen' ? "fixed inset-0 bg-background z-50" : "min-h-[400px]"
      )}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading property data...</p>
        </div>
      </div>
    );
  }

  if (!propertyData) {
    return (
      <div className={cn(
        "flex items-center justify-center",
        mode === 'fullscreen' ? "fixed inset-0 bg-background z-50" : "min-h-[400px]"
      )}>
        <div className="flex flex-col items-center gap-4 text-center p-6">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Property Not Found</h2>
          <p className="text-muted-foreground">Unable to load property data. Please try again.</p>
          {onClose && (
            <Button onClick={onClose} variant="outline">Go Back</Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col bg-background",
      mode === 'fullscreen' && "fixed inset-0 z-50"
    )}>
      {/* Header */}
      <header className="flex-shrink-0 border-b bg-card">
        <div className="flex items-center justify-between px-4 py-3 md:px-6">
          {/* Left: Close/Back */}
          <div className="flex items-center gap-3">
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold truncate max-w-[200px] md:max-w-none">
                {propertyData.name || "Property Onboarding"}
              </h1>
            </div>
          </div>

          {/* Center: Step indicator (mobile) */}
          <div className="sm:hidden">
            <span className="text-sm font-medium">
              Step {currentStep + 1} of {WIZARD_SECTIONS.length}
            </span>
          </div>

          {/* Right: Save status & Score */}
          <div className="flex items-center gap-3">
            {/* Save indicator */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : lastSavedAt ? (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  <span className="hidden sm:inline">Saved</span>
                </>
              ) : null}
            </div>

            {/* Score badge */}
            <div className={cn(
              "hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
              scoreBand.color,
              "bg-muted"
            )}>
              <span>{score}%</span>
              <span className="hidden md:inline">• {scoreBand.label}</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-3 md:px-6">
          <Progress value={completionPercent} className="h-2" />
          <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
            <span>{completionPercent}% complete</span>
            <span className="hidden sm:inline">{currentSection?.title}</span>
          </div>
        </div>

        {/* Step navigation (desktop) */}
        <nav className="hidden lg:flex border-t overflow-x-auto">
          {WIZARD_SECTIONS.map((section, index) => (
            <button
              key={section.id}
              onClick={() => goToStep(index)}
              className={cn(
                "flex-1 min-w-[100px] px-3 py-2 text-xs font-medium transition-colors border-b-2",
                index === currentStep
                  ? "border-primary text-primary bg-primary/5"
                  : index < currentStep
                  ? "border-transparent text-muted-foreground hover:text-foreground"
                  : "border-transparent text-muted-foreground/50 hover:text-muted-foreground"
              )}
            >
              <span className="truncate">{section.title}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-6">
                <h2 className="text-2xl font-semibold">{currentSection?.title}</h2>
                <p className="text-muted-foreground mt-1">
                  {currentSection?.description}
                </p>
              </div>

              {CurrentStepComponent && (
                <CurrentStepComponent
                  propertyData={propertyData}
                  updateField={updateField}
                  isPMSManaged={isPMSManaged}
                  getAmenityValue={getAmenityValue}
                  onComplete={onComplete}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Footer navigation */}
      <footer className="flex-shrink-0 border-t bg-card">
        <div className="flex items-center justify-between px-4 py-3 md:px-6">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={isFirstStep}
            className="gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>

          {/* Mobile step dots */}
          <div className="flex gap-1 sm:hidden">
            {WIZARD_SECTIONS.slice(0, 6).map((_, index) => (
              <div
                key={index}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  index === currentStep
                    ? "bg-primary"
                    : index < currentStep
                    ? "bg-primary/40"
                    : "bg-muted"
                )}
              />
            ))}
            {WIZARD_SECTIONS.length > 6 && (
              <span className="text-xs text-muted-foreground">...</span>
            )}
          </div>

          <Button
            onClick={isLastStep ? onComplete : nextStep}
            className="gap-1.5"
          >
            <span>{isLastStep ? "Complete" : "Next"}</span>
            {!isLastStep && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </footer>
    </div>
  );
}
