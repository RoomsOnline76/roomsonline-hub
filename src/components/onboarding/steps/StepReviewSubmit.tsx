import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, AlertCircle, Send, Award, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { StepProps } from "./types";
import { SCORE_WEIGHTS, getScoreBand, OnboardingImage } from "@/config/onboardingFieldSchema";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { roomHasMaxGuests, roomHasRate } from "@/lib/websiteWizardHydrate";

interface MissingItem {
  label: string;
  impact: 'critical' | 'high' | 'medium' | 'low';
}

interface SectionStatus {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  isComplete: boolean;
  missingItems: MissingItem[];
}

const IMPACT_STYLES = {
  critical: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30" },
  high: { bg: "bg-orange-500/10", text: "text-orange-600", border: "border-orange-500/30" },
  medium: { bg: "bg-yellow-500/10", text: "text-yellow-600", border: "border-yellow-500/30" },
  low: { bg: "bg-muted", text: "text-muted-foreground", border: "border-muted" },
};

export function StepReviewSubmit({
  propertyData,
  getAmenityValue,
  onComplete
}: StepProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const amenities = (propertyData.amenities || {}) as Record<string, unknown>;

  // Helper to get nested values from amenities
  const getNestedValue = (...paths: string[]): unknown => {
    for (const path of paths) {
      const parts = path.split('.');
      let current: unknown = amenities;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
          current = (current as Record<string, unknown>)[part];
        } else {
          current = undefined;
          break;
        }
      }
      if (current !== undefined && current !== null && current !== '') {
        return current;
      }
    }
    return undefined;
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const calculateSectionScores = (): SectionStatus[] => {
    const sections: SectionStatus[] = [];

    // Property Identity (includes offerings & business)
    const offerings = amenities.offerings as Record<string, boolean> | undefined;
    const offeringCount = offerings ? Object.values(offerings).filter(Boolean).length : 0;
    const hasName = !!propertyData.name;
    const hasType = !!propertyData.property_type;
    const hasOfferings = offeringCount > 0;
    const identityFields = [hasName, hasType, hasOfferings].filter(Boolean).length;
    
    const identityMissing: MissingItem[] = [];
    if (!hasName) identityMissing.push({ label: "Property name", impact: "critical" });
    if (!hasType) identityMissing.push({ label: "Property type", impact: "critical" });
    if (!hasOfferings) identityMissing.push({ label: "Offerings (accommodation, events, etc.)", impact: "high" });
    
    sections.push({
      id: "property_identity",
      title: "Property Identity",
      score: Math.round((identityFields / 3) * SCORE_WEIGHTS.property_identity),
      maxScore: SCORE_WEIGHTS.property_identity,
      isComplete: identityFields >= 2,
      missingItems: identityMissing
    });

    // Contact Details - check nested paths
    const hasPhone = !!(getNestedValue('contact.telephone', 'telephone') || getNestedValue('contact.mobile', 'mobile'));
    const hasEmail = !!(getNestedValue('contact.email', 'contact_email'));
    const contactFields = [hasPhone, hasEmail].filter(Boolean).length;
    
    const contactMissing: MissingItem[] = [];
    if (!hasPhone) contactMissing.push({ label: "Phone number", impact: "high" });
    if (!hasEmail) contactMissing.push({ label: "Email address", impact: "high" });
    
    sections.push({
      id: "contact_details",
      title: "Contact & Team",
      score: Math.round((contactFields / 2) * SCORE_WEIGHTS.contact_details),
      maxScore: SCORE_WEIGHTS.contact_details,
      isComplete: contactFields >= 1,
      missingItems: contactMissing
    });

    // Location
    const hasAddress = !!propertyData.address;
    const hasCity = !!propertyData.city;
    const hasCountry = !!propertyData.country;
    const hasCoords = !!propertyData.latitude;
    const locationFields = [hasAddress, hasCity, hasCountry, hasCoords].filter(Boolean).length;
    
    const locationMissing: MissingItem[] = [];
    if (!hasAddress) locationMissing.push({ label: "Street address", impact: "critical" });
    if (!hasCity) locationMissing.push({ label: "City", impact: "critical" });
    if (!hasCountry) locationMissing.push({ label: "Country", impact: "critical" });
    if (!hasCoords) locationMissing.push({ label: "Map coordinates", impact: "medium" });
    
    sections.push({
      id: "location",
      title: "Location",
      score: Math.round((locationFields / 4) * SCORE_WEIGHTS.location),
      maxScore: SCORE_WEIGHTS.location,
      isComplete: locationFields >= 3,
      missingItems: locationMissing
    });

    // Policies & Pricing
    const hasCheckInTime = !!(getNestedValue('house_rules.check_in_from', 'check_in_from', 'check_in_time'));
    const hasCheckOutTime = !!(getNestedValue('house_rules.check_out_to', 'check_out_to', 'check_out_from'));
    const hasBanking = !!(getNestedValue('banking.bank_name', 'bank_name', 'banking.bank_confirmation_letter_url', 'bank_confirmation_letter_url'));
    const cancellationPolicies = getNestedValue('cancellation_policies') as unknown[] | undefined;
    const hasCancellation = !!(cancellationPolicies && cancellationPolicies.length > 0) || !!getNestedValue('cancellation_policy');
    const hasPaymentPolicy = !!getNestedValue('payment_policy');
    
    const policyFields = [hasCheckInTime, hasCheckOutTime, hasBanking, hasCancellation, hasPaymentPolicy].filter(Boolean).length;
    
    const policyMissing: MissingItem[] = [];
    if (!hasCheckInTime) policyMissing.push({ label: "Check-in time", impact: "critical" });
    if (!hasCheckOutTime) policyMissing.push({ label: "Check-out time", impact: "critical" });
    if (!hasBanking) policyMissing.push({ label: "Banking details", impact: "high" });
    if (!hasCancellation) policyMissing.push({ label: "Cancellation policy", impact: "high" });
    if (!hasPaymentPolicy) policyMissing.push({ label: "Payment policy", impact: "medium" });
    
    sections.push({
      id: "policies_pricing",
      title: "Policies & Pricing",
      score: Math.round((policyFields / 5) * SCORE_WEIGHTS.policies_pricing),
      maxScore: SCORE_WEIGHTS.policies_pricing,
      isComplete: hasCheckInTime && hasCheckOutTime,
      missingItems: policyMissing
    });

    // Guest Experience
    const hasDescription = !!propertyData.description;
    const hasShortDesc = !!propertyData.short_description;
    const hasUSP = !!getNestedValue('unique_selling_points');
    const hasMealPlan = !!(getNestedValue('meal_plan') || (getNestedValue('breakfast_options') as unknown[] | undefined)?.length);
    const descFields = [hasDescription, hasShortDesc, hasUSP, hasMealPlan].filter(Boolean).length;
    
    const guestMissing: MissingItem[] = [];
    if (!hasDescription) guestMissing.push({ label: "Full description", impact: "critical" });
    if (!hasShortDesc) guestMissing.push({ label: "Short marketing summary", impact: "high" });
    if (!hasUSP) guestMissing.push({ label: "Unique selling points", impact: "medium" });
    if (!hasMealPlan) guestMissing.push({ label: "Meal options", impact: "low" });
    
    sections.push({
      id: "guest_experience",
      title: "Guest Experience",
      score: Math.round((descFields / 4) * SCORE_WEIGHTS.guest_experience),
      maxScore: SCORE_WEIGHTS.guest_experience,
      isComplete: !!propertyData.description,
      missingItems: guestMissing
    });

    // Facilities
    const facilities = amenities.facilities as string[] | undefined;
    const hasFacilities = (facilities?.length || 0) >= 5;
    
    const facilityMissing: MissingItem[] = [];
    if (!facilities || facilities.length === 0) {
      facilityMissing.push({ label: "No facilities selected", impact: "high" });
    } else if (facilities.length < 5) {
      facilityMissing.push({ label: `Only ${facilities.length} facilities (recommend 5+)`, impact: "medium" });
    }
    
    sections.push({
      id: "facilities",
      title: "Facilities",
      score: facilities && facilities.length > 0 ? SCORE_WEIGHTS.facilities : 0,
      maxScore: SCORE_WEIGHTS.facilities,
      isComplete: hasFacilities,
      missingItems: facilityMissing
    });

    // Rooms
    const roomTypes = (amenities.room_types as Record<string, unknown>[] | undefined) ?? [];
    const hasRooms = roomTypes.length > 0;
    const allRoomsNamed = roomTypes.every((r) => !!String(r.name ?? "").trim());
    const allRoomsHaveGuests = roomTypes.length > 0 && roomTypes.every((r) => roomHasMaxGuests(r));
    const allRoomsHaveRates = roomTypes.length > 0 && roomTypes.every((r) => roomHasRate(r));
    const roomsComplete = hasRooms && allRoomsNamed && allRoomsHaveGuests;
    
    const roomMissing: MissingItem[] = [];
    if (!hasRooms) {
      roomMissing.push({ label: "No rooms added", impact: "critical" });
    } else {
      if (!allRoomsNamed) roomMissing.push({ label: "Some rooms missing names", impact: "critical" });
      if (!allRoomsHaveGuests) roomMissing.push({ label: "Some rooms missing max guests", impact: "critical" });
      if (!allRoomsHaveRates) roomMissing.push({ label: "Some rooms missing rates", impact: "high" });
    }
    
    sections.push({
      id: "rooms_overview",
      title: "Rooms",
      score: hasRooms ? SCORE_WEIGHTS.rooms_overview : 0,
      maxScore: SCORE_WEIGHTS.rooms_overview,
      isComplete: !!roomsComplete,
      missingItems: roomMissing
    });

    // Media & Documents
    const images = (propertyData.images || []) as unknown as OnboardingImage[];
    const hasHero = images.some(img => img.type === 'hero');
    const hasMinImages = images.length >= 3;
    const imageScore = hasHero && hasMinImages ? 1 : 
                       hasMinImages ? 0.7 : 
                       images.length / 3;
    
    const mediaMissing: MissingItem[] = [];
    if (images.length === 0) {
      mediaMissing.push({ label: "No images uploaded", impact: "critical" });
    } else {
      if (!hasMinImages) mediaMissing.push({ label: `Only ${images.length} images (minimum 3)`, impact: "critical" });
      if (!hasHero) mediaMissing.push({ label: "No hero image designated", impact: "high" });
    }
    
    sections.push({
      id: "media_documents",
      title: "Media & Documents",
      score: Math.round(imageScore * SCORE_WEIGHTS.media_documents),
      maxScore: SCORE_WEIGHTS.media_documents,
      isComplete: hasMinImages && hasHero,
      missingItems: mediaMissing
    });

    return sections;
  };

  const sectionScores = calculateSectionScores();
  const totalScore = sectionScores.reduce((sum, s) => sum + s.score, 0);
  const scoreBand = getScoreBand(totalScore);
  const completedSections = sectionScores.filter(s => s.isComplete).length;

  // Determine readiness label
  const getReadinessLabel = (score: number) => {
    if (score >= 90) return "Ready to List";
    if (score >= 70) return "Nearly Ready";
    return "Needs Attention";
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const updatedAmenities = {
        ...amenities,
        onboarding_meta: {
          completion_percent: totalScore,
          score: totalScore,
          last_updated_at: new Date().toISOString(),
          submitted_at: new Date().toISOString(),
          readiness_band: getReadinessLabel(totalScore)
        },
        // Legacy fields for backward compatibility
        onboarding_completion_percent: totalScore,
        onboarding_score: totalScore,
        onboarding_last_submitted_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from("properties")
        .update({ amenities: updatedAmenities })
        .eq("id", propertyData.id);

      if (error) throw error;

      toast({
        title: "Onboarding complete!",
        description: `Your property profile is ${totalScore}% complete.`
      });

      onComplete?.();
    } catch (error) {
      toast({ title: "Submission failed", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader className="text-center pb-2">
          <CardTitle className="flex items-center justify-center gap-2">
            <Award className={cn("h-6 w-6", scoreBand.color)} />
            <span className={scoreBand.color}>{getReadinessLabel(totalScore)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <div className="text-5xl font-bold mb-2">{totalScore}%</div>
          <p className="text-muted-foreground mb-4">{scoreBand.badge}</p>
          <Progress value={totalScore} className="h-3" />
          <p className="text-sm text-muted-foreground mt-3">
            {completedSections} of {sectionScores.length} sections complete
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {sectionScores.map((section) => {
          const hasMissing = section.missingItems.length > 0;
          const isExpanded = expandedSections.has(section.id);
          
          return (
            <Collapsible
              key={section.id}
              open={isExpanded}
              onOpenChange={() => hasMissing && toggleSection(section.id)}
            >
              <div className={cn(
                "rounded-lg border transition-colors",
                hasMissing && "cursor-pointer hover:bg-muted/50"
              )}>
                <CollapsibleTrigger asChild disabled={!hasMissing}>
                  <div className="flex items-center gap-3 p-3">
                    <div className={cn(
                      "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                      section.isComplete ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground"
                    )}>
                      {section.isComplete ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{section.title}</p>
                      {!section.isComplete && hasMissing && (
                        <p className="text-xs text-muted-foreground">
                          {section.missingItems.length} item{section.missingItems.length > 1 ? 's' : ''} missing
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0 text-sm">
                        <span className={section.isComplete ? "text-green-600" : "text-muted-foreground"}>{section.score}</span>
                        <span className="text-muted-foreground">/{section.maxScore}</span>
                      </div>
                      {hasMissing && (
                        isExpanded ? 
                          <ChevronUp className="h-4 w-4 text-muted-foreground" /> : 
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-0 border-t">
                    <div className="pt-3 space-y-2">
                      {section.missingItems.map((item, idx) => {
                        const style = IMPACT_STYLES[item.impact];
                        return (
                          <div 
                            key={idx} 
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-md border",
                              style.bg,
                              style.border
                            )}
                          >
                            <AlertTriangle className={cn("h-3.5 w-3.5 flex-shrink-0", style.text)} />
                            <span className="text-sm flex-1">{item.label}</span>
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "text-[10px] uppercase font-semibold",
                                style.text,
                                style.border
                              )}
                            >
                              {item.impact}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      <Button size="lg" onClick={handleSubmit} disabled={isSubmitting} className="w-full gap-2">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {isSubmitting ? "Completing..." : "Complete Onboarding"}
      </Button>
    </div>
  );
}
