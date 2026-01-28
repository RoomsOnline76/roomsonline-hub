import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Building2, Users, Bed, Calendar, ChevronLeft, ChevronRight, 
  Check, Loader2, Hotel, Landmark, PartyPopper, Compass,
  Percent, DollarSign, Sparkles, Wifi, WifiOff, Plug, Radio
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export type ListingIntent = 'accommodation' | 'venue' | 'hybrid' | 'experience';
export type CommercialModel = 'commission' | 'flat_fee' | 'special';
export type PMSReadiness = 'none' | 'planned' | 'connected' | 'live';

interface PreFlightData {
  listing_intent: ListingIntent | null;
  commercial_model: CommercialModel | null;
  pms_readiness: PMSReadiness | null;
  owner_email: string;
  owner_name: string;
}

const INTENT_OPTIONS: { value: ListingIntent; label: string; description: string; icon: React.ElementType; requiredSteps: string[] }[] = [
  { 
    value: 'accommodation', 
    label: 'Accommodation', 
    description: 'Hotels, B&Bs, guesthouses, self-catering units',
    icon: Bed,
    requiredSteps: ['Rooms & Rates', 'Pricing', 'Facilities', 'Media']
  },
  { 
    value: 'venue', 
    label: 'Venue', 
    description: 'Event spaces, conference facilities, wedding venues',
    icon: Landmark,
    requiredSteps: ['Capacity & Layout', 'Event Types', 'Facilities', 'Media']
  },
  { 
    value: 'hybrid', 
    label: 'Hybrid', 
    description: 'Combined accommodation and venue offering',
    icon: Hotel,
    requiredSteps: ['Rooms & Rates', 'Capacity', 'Event Types', 'Facilities', 'Media']
  },
  { 
    value: 'experience', 
    label: 'Experience', 
    description: 'Tours, activities, day experiences',
    icon: Compass,
    requiredSteps: ['Experience Details', 'Logistics', 'Pricing', 'Media']
  },
];

const COMMERCIAL_OPTIONS: { value: CommercialModel; label: string; description: string; icon: React.ElementType }[] = [
  { 
    value: 'commission', 
    label: 'Commission', 
    description: 'Percentage of each booking (standard)',
    icon: Percent
  },
  { 
    value: 'flat_fee', 
    label: 'Flat Fee', 
    description: 'Fixed monthly or annual fee',
    icon: DollarSign
  },
  { 
    value: 'special', 
    label: 'Special Terms', 
    description: 'Custom agreement to be negotiated',
    icon: Sparkles
  },
];

const PMS_OPTIONS: { value: PMSReadiness; label: string; description: string; icon: React.ElementType }[] = [
  { 
    value: 'none', 
    label: 'No PMS', 
    description: 'Will manage availability manually',
    icon: WifiOff
  },
  { 
    value: 'planned', 
    label: 'Planned', 
    description: 'Planning to connect a PMS soon',
    icon: Plug
  },
  { 
    value: 'connected', 
    label: 'Connected', 
    description: 'PMS already connected to ROL',
    icon: Wifi
  },
  { 
    value: 'live', 
    label: 'Live Integration', 
    description: 'Active, real-time PMS sync',
    icon: Radio
  },
];

const STEPS = ['Intent', 'Commercial', 'PMS', 'Owner', 'Review'];

export function PreFlightWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [data, setData] = useState<PreFlightData>({
    listing_intent: null,
    commercial_model: null,
    pms_readiness: null,
    owner_email: '',
    owner_name: '',
  });

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  const canProceed = () => {
    switch (currentStep) {
      case 0: return data.listing_intent !== null;
      case 1: return data.commercial_model !== null;
      case 2: return data.pms_readiness !== null;
      case 3: return data.owner_email.trim() !== '' && data.owner_email.includes('@');
      case 4: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!data.listing_intent || !data.commercial_model || !data.pms_readiness) {
      toast.error("Please complete all steps");
      return;
    }

    setIsSubmitting(true);
    try {
      // Create property in draft_pre_contract status
      // Note: Using 'as any' because new columns may not be in generated types yet
      const { data: newProperty, error } = await supabase
        .from("properties")
        .insert({
          name: `New ${data.listing_intent} listing`,
          address: '',
          owner_email: data.owner_email,
          owner_name: data.owner_name || null,
          listing_intent: data.listing_intent,
          commercial_model: data.commercial_model,
          pms_readiness: data.pms_readiness,
          listing_status: 'draft_pre_contract',
          is_active: true,
          show_on_website: false,
          price_per_night: 0,
          bedrooms: 1,
          bathrooms: 1,
        } as any)
        .select()
        .single();

      if (error) throw error;

      toast.success("Property draft created! Ready for contract.");
      // Navigate to contracts page to send contract
      navigate(`/admin/contracts?new=${newProperty.id}`);
    } catch (error: any) {
      console.error("Error creating property:", error);
      toast.error(error.message || "Failed to create property draft");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedIntent = INTENT_OPTIONS.find(o => o.value === data.listing_intent);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold">New Property Pre-Flight</h1>
              <p className="text-sm text-muted-foreground">Define listing intent before sending contract</p>
            </div>
            <Button variant="ghost" onClick={() => navigate('/admin/property-overview')}>
              Cancel
            </Button>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            {STEPS.map((step, i) => (
              <span key={step} className={cn(i === currentStep && "text-primary font-medium")}>
                {step}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Step 0: Listing Intent */}
            {currentStep === 0 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">What type of listing is this?</h2>
                  <p className="text-sm text-muted-foreground">This determines the onboarding steps and required fields</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {INTENT_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isSelected = data.listing_intent === option.value;
                    return (
                      <Card 
                        key={option.value}
                        className={cn(
                          "cursor-pointer transition-all hover:border-primary/50",
                          isSelected && "border-primary ring-2 ring-primary/20"
                        )}
                        onClick={() => setData({ ...data, listing_intent: option.value })}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-2 rounded-lg",
                              isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                            )}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div>
                              <CardTitle className="text-base">{option.label}</CardTitle>
                            </div>
                            {isSelected && <Check className="h-5 w-5 text-primary ml-auto" />}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <CardDescription>{option.description}</CardDescription>
                          {isSelected && (
                            <div className="mt-3 pt-3 border-t">
                              <p className="text-xs font-medium text-muted-foreground mb-2">Required steps:</p>
                              <div className="flex flex-wrap gap-1">
                                {option.requiredSteps.map(step => (
                                  <Badge key={step} variant="secondary" className="text-xs">{step}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 1: Commercial Model */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">Commercial Model</h2>
                  <p className="text-sm text-muted-foreground">How will this property be charged?</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {COMMERCIAL_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isSelected = data.commercial_model === option.value;
                    return (
                      <Card 
                        key={option.value}
                        className={cn(
                          "cursor-pointer transition-all hover:border-primary/50",
                          isSelected && "border-primary ring-2 ring-primary/20"
                        )}
                        onClick={() => setData({ ...data, commercial_model: option.value })}
                      >
                        <CardHeader className="text-center">
                          <div className={cn(
                            "mx-auto p-3 rounded-full mb-2",
                            isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                          )}>
                            <Icon className="h-6 w-6" />
                          </div>
                          <CardTitle className="text-base">{option.label}</CardTitle>
                          <CardDescription className="text-xs">{option.description}</CardDescription>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: PMS Readiness */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">PMS Integration Status</h2>
                  <p className="text-sm text-muted-foreground">Does this property have a Property Management System?</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {PMS_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isSelected = data.pms_readiness === option.value;
                    return (
                      <Card 
                        key={option.value}
                        className={cn(
                          "cursor-pointer transition-all hover:border-primary/50",
                          isSelected && "border-primary ring-2 ring-primary/20"
                        )}
                        onClick={() => setData({ ...data, pms_readiness: option.value })}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-2 rounded-lg",
                              isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                            )}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div>
                              <CardTitle className="text-base">{option.label}</CardTitle>
                              <CardDescription className="text-xs">{option.description}</CardDescription>
                            </div>
                            {isSelected && <Check className="h-5 w-5 text-primary ml-auto" />}
                          </div>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Owner Details */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">Owner Details</h2>
                  <p className="text-sm text-muted-foreground">Who owns or manages this property?</p>
                </div>
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="owner_email">Owner Email *</Label>
                      <Input
                        id="owner_email"
                        type="email"
                        placeholder="owner@example.com"
                        value={data.owner_email}
                        onChange={(e) => setData({ ...data, owner_email: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Contract will be sent to this email address
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="owner_name">Owner Name (optional)</Label>
                      <Input
                        id="owner_name"
                        placeholder="John Smith"
                        value={data.owner_name}
                        onChange={(e) => setData({ ...data, owner_name: e.target.value })}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step 4: Review */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">Review & Confirm</h2>
                  <p className="text-sm text-muted-foreground">Verify the pre-flight configuration</p>
                </div>
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-sm text-muted-foreground">Listing Type</span>
                        <div className="flex items-center gap-2">
                          {selectedIntent && <selectedIntent.icon className="h-4 w-4" />}
                          <span className="font-medium capitalize">{data.listing_intent}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-sm text-muted-foreground">Commercial Model</span>
                        <span className="font-medium capitalize">{data.commercial_model?.replace('_', ' ')}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-sm text-muted-foreground">PMS Status</span>
                        <Badge variant={data.pms_readiness === 'live' ? 'default' : 'secondary'}>
                          {data.pms_readiness?.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-sm text-muted-foreground">Owner Email</span>
                        <span className="font-medium">{data.owner_email}</span>
                      </div>
                      {data.owner_name && (
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-sm text-muted-foreground">Owner Name</span>
                          <span className="font-medium">{data.owner_name}</span>
                        </div>
                      )}
                    </div>

                    {selectedIntent && (
                      <div className="mt-6 p-4 bg-muted rounded-lg">
                        <p className="text-sm font-medium mb-2">Required onboarding steps:</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedIntent.requiredSteps.map(step => (
                            <Badge key={step} variant="outline">{step}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-6 p-4 bg-primary/10 rounded-lg">
                      <p className="text-sm">
                        <strong>Next:</strong> After creating this draft, you'll be redirected to send the contract to {data.owner_email}.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between">
          <Button 
            variant="outline" 
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          
          {currentStep < STEPS.length - 1 ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting || !canProceed()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Create Draft & Send Contract
                </>
              )}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
