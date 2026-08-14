import { useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Loader2, Check, AlertTriangle, Info, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePropertyOnboarding } from "@/hooks/usePropertyOnboarding";
import { OnboardingTobiPanel } from "@/components/onboarding/OnboardingTobiPanel";
import { COMPLETION_STATES, FieldImpactLevel } from "@/config/onboardingFieldSchema";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

// Map step IDs to components
const STEP_COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  property_identity: StepPropertyIdentity,
  contact_details: StepContactDetails,
  location: StepLocation,
  policies_pricing: StepPoliciesPricing,
  guest_experience: StepGuestExperience,
  facilities: StepFacilities,
  rooms_overview: StepRoomsOverview,
  media_documents: StepMediaDocuments,
  review: StepReviewSubmit,
  // Placeholder components for venue/experience steps
  capacity: StepFacilities, // TODO: Create dedicated component
  event_types: StepFacilities, // TODO: Create dedicated component
  experience_details: StepGuestExperience, // TODO: Create dedicated component
  logistics: StepPoliciesPricing, // TODO: Create dedicated component
};

const IMPACT_COLORS: Record<FieldImpactLevel, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-muted text-muted-foreground'
};

export function PropertyOnboardingWizard({ propertyId, mode, ownerEmail, onComplete, onClose }: PropertyOnboardingWizardProps) {
  const {
    currentStep, 
    propertyData, 
    isLoading, 
    isSaving, 
    lastSavedAt, 
    completionPercent, 
    score, 
    scoreBand,
    wizardSteps,
    completionState,
    completionStateDetails,
    missingFields,
    nextAction,
    listingIntent,
    updateField, 
    isPMSManaged, 
    goToStep, 
    goToStepById,
    nextStep, 
    prevStep, 
    getAmenityValue
  } = usePropertyOnboarding(propertyId, ownerEmail);

  const currentSection = wizardSteps[currentStep];
  const CurrentStepComponent = currentSection ? STEP_COMPONENT_MAP[currentSection.id] : null;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === wizardSteps.length - 1;

  // Count missing fields by impact
  const missingCounts = useMemo(() => ({
    critical: missingFields.critical.length,
    high: missingFields.high.length,
    medium: missingFields.medium.length,
    low: missingFields.low.length,
    total: missingFields.critical.length + missingFields.high.length + missingFields.medium.length
  }), [missingFields]);

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
            <div className="flex flex-col">
              <h1 className="hidden sm:block text-lg font-semibold truncate max-w-[200px]">{propertyData.name || "Property Onboarding"}</h1>
              <span className="hidden sm:block text-xs text-muted-foreground capitalize">{listingIntent} listing</span>
            </div>
          </div>

          <span className="sm:hidden text-sm font-medium">Step {currentStep + 1}/{wizardSteps.length}</span>

          <div className="flex items-center gap-3">
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : lastSavedAt && <Check className="h-3 w-3 text-green-500" />}
            
            {/* Completion State Badge */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn(
                    "hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                    completionStateDetails.color
                  )}>
                    {score}% • {completionStateDetails.label}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-2">
                    <p className="font-medium">{completionStateDetails.label}</p>
                    {completionStateDetails.blocked && (
                      <p className="text-xs text-muted-foreground">
                        Score must reach 50% before property can be submitted for review.
                      </p>
                    )}
                    {missingCounts.critical > 0 && (
                      <p className="text-xs text-destructive">
                        {missingCounts.critical} critical field{missingCounts.critical > 1 ? 's' : ''} missing
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="px-4 pb-3">
          <Progress value={completionPercent} className="h-2" />
          <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
            <span>{completionPercent}% complete</span>
            <span className="hidden sm:inline">{currentSection?.title}</span>
          </div>
        </div>

        {/* Step Navigation */}
        <nav className="hidden lg:flex items-center justify-center border-t py-2 px-4 gap-2">
          {currentStep > 0 && (
            <>
              <button onClick={() => goToStep(currentStep - 1)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">{wizardSteps[currentStep - 1]?.title}</button>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            </>
          )}
          <span className="px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-full">{currentSection?.title}</span>
          {currentStep < wizardSteps.length - 1 && (
            <>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              <button onClick={() => goToStep(currentStep + 1)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">{wizardSteps[currentStep + 1]?.title}</button>
            </>
          )}
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <AnimatePresence mode="wait">
            <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {/* Step Header with "Why it matters" */}
              <div className="mb-6">
                <h2 className="text-xl font-semibold">{currentSection?.title}</h2>
                <p className="text-sm text-muted-foreground">{currentSection?.description}</p>
                
                {/* Why it matters hint */}
                {currentSection?.whyItMatters && (
                  <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground">{currentSection.whyItMatters}</p>
                  </div>
                )}
                <div className="mt-3">
                  <OnboardingTobiPanel
                    context={{
                      wizard: "website",
                      propertyId,
                      propertyName: propertyData.name || "this property",
                      stepTitle: currentSection?.title || "Website listing",
                      stepGoal: currentSection?.description,
                      score: completionPercent,
                      blockers: [
                        ...missingFields.critical,
                        ...missingFields.high,
                        ...missingFields.medium,
                      ].map((field) => ({
                        label: field.label,
                        section: field.section,
                        fieldKey: field.key,
                        mandatory: field.impact === "critical" || field.impact === "high",
                      })),
                    }}
                    onOpenField={(_section, fieldKey) => {
                      if (fieldKey) {
                        const field = [
                          ...missingFields.critical,
                          ...missingFields.high,
                          ...missingFields.medium,
                          ...missingFields.low,
                        ].find((f) => f.key === fieldKey);
                        if (field) goToStepById(field.section);
                      }
                    }}
                  />
                </div>
              </div>
              
              {CurrentStepComponent && (
                <CurrentStepComponent propertyData={propertyData} updateField={updateField} isPMSManaged={isPMSManaged} getAmenityValue={getAmenityValue} onComplete={onComplete} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Missing Fields Panel (collapsible) */}
      {missingCounts.total > 0 && currentStep === wizardSteps.length - 1 && (
        <div className="border-t bg-muted/30 px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-sm font-medium mb-2">Missing Fields by Impact</h3>
            <div className="flex flex-wrap gap-2">
              {missingFields.critical.map(field => (
                <Badge 
                  key={field.key} 
                  variant="outline"
                  className={cn("cursor-pointer", IMPACT_COLORS.critical)}
                  onClick={() => goToStepById(field.section)}
                >
                  {field.label}
                </Badge>
              ))}
              {missingFields.high.map(field => (
                <Badge 
                  key={field.key} 
                  variant="outline"
                  className={cn("cursor-pointer", IMPACT_COLORS.high)}
                  onClick={() => goToStepById(field.section)}
                >
                  {field.label}
                </Badge>
              ))}
              {missingFields.medium.map(field => (
                <Badge 
                  key={field.key} 
                  variant="outline"
                  className={cn("cursor-pointer", IMPACT_COLORS.medium)}
                  onClick={() => goToStepById(field.section)}
                >
                  {field.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="flex-shrink-0 border-t bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="outline" onClick={prevStep} disabled={isFirstStep} className="gap-1.5">
            <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Previous</span>
          </Button>
          
          {/* Next Action Hint (mobile) */}
          {nextAction && !isLastStep && (
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
              <span>Next:</span>
              <button 
                onClick={() => goToStepById(nextAction.stepId)} 
                className="flex items-center gap-1 text-primary hover:underline"
              >
                {nextAction.label}
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}
          
          <div className="flex gap-1 sm:hidden">
            {wizardSteps.slice(0, Math.min(9, wizardSteps.length)).map((_, i) => (
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
