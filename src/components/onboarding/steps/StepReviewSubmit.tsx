import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, AlertCircle, Send, Award } from "lucide-react";
import { StepProps } from "./types";
import { SCORE_WEIGHTS, getScoreBand, OnboardingImage } from "@/config/onboardingFieldSchema";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SectionStatus {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  isComplete: boolean;
}

export function StepReviewSubmit({
  propertyData,
  getAmenityValue,
  onComplete
}: StepProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amenities = (propertyData.amenities || {}) as Record<string, unknown>;

  const calculateSectionScores = (): SectionStatus[] => {
    const sections: SectionStatus[] = [];

    // Property Identity (includes offerings & business)
    const offerings = amenities.offerings as Record<string, boolean> | undefined;
    const offeringCount = offerings ? Object.values(offerings).filter(Boolean).length : 0;
    const identityFields = [propertyData.name, propertyData.property_type, offeringCount > 0].filter(Boolean).length;
    sections.push({
      id: "property_identity",
      title: "Property Identity",
      score: Math.round((identityFields / 3) * SCORE_WEIGHTS.property_identity),
      maxScore: SCORE_WEIGHTS.property_identity,
      isComplete: identityFields >= 2
    });

    // Contact Details
    const contactFields = [amenities.telephone, amenities.contact_email].filter(Boolean).length;
    sections.push({
      id: "contact_details",
      title: "Contact & Team",
      score: Math.round((contactFields / 2) * SCORE_WEIGHTS.contact_details),
      maxScore: SCORE_WEIGHTS.contact_details,
      isComplete: contactFields >= 1
    });

    // Location
    const locationFields = [propertyData.address, propertyData.city, propertyData.country, propertyData.latitude].filter(Boolean).length;
    sections.push({
      id: "location",
      title: "Location",
      score: Math.round((locationFields / 4) * SCORE_WEIGHTS.location),
      maxScore: SCORE_WEIGHTS.location,
      isComplete: locationFields >= 3
    });

    // Policies & Pricing (enhanced with new fields)
    const policyFields = [
      amenities.check_in_from || amenities.check_in_time,
      amenities.bank_name || amenities.bank_confirmation_letter_url,
      amenities.account_number,
      amenities.cancellation_policy,
      amenities.payment_policy
    ].filter(Boolean).length;
    sections.push({
      id: "policies_pricing",
      title: "Policies & Pricing",
      score: Math.round((policyFields / 5) * SCORE_WEIGHTS.policies_pricing),
      maxScore: SCORE_WEIGHTS.policies_pricing,
      isComplete: policyFields >= 2
    });

    // Guest Experience (enhanced with new fields)
    const descFields = [
      propertyData.description,
      propertyData.short_description,
      amenities.unique_selling_points,
      amenities.meal_plan
    ].filter(Boolean).length;
    sections.push({
      id: "guest_experience",
      title: "Guest Experience",
      score: Math.round((descFields / 4) * SCORE_WEIGHTS.guest_experience),
      maxScore: SCORE_WEIGHTS.guest_experience,
      isComplete: !!propertyData.description
    });

    // Facilities
    const facilities = amenities.facilities as string[] | undefined;
    sections.push({
      id: "facilities",
      title: "Facilities",
      score: facilities && facilities.length > 0 ? SCORE_WEIGHTS.facilities : 0,
      maxScore: SCORE_WEIGHTS.facilities,
      isComplete: (facilities?.length || 0) >= 5
    });

    // Rooms (enhanced with units and rate_unit)
    const roomTypes = amenities.room_types as Array<{ name?: string; units?: number; max_guests?: number }> | undefined;
    const roomsComplete = roomTypes && roomTypes.length > 0 && roomTypes.every(r => r.name && r.max_guests);
    sections.push({
      id: "rooms_overview",
      title: "Rooms",
      score: roomTypes && roomTypes.length > 0 ? SCORE_WEIGHTS.rooms_overview : 0,
      maxScore: SCORE_WEIGHTS.rooms_overview,
      isComplete: !!roomsComplete
    });

    // Media & Documents (enhanced with image validation)
    const images = (propertyData.images || []) as unknown as OnboardingImage[];
    const hasHero = images.some(img => img.type === 'hero');
    const hasMinImages = images.length >= 3;
    const imageScore = hasHero && hasMinImages ? 1 : 
                       hasMinImages ? 0.7 : 
                       images.length / 3;
    sections.push({
      id: "media_documents",
      title: "Media & Documents",
      score: Math.round(imageScore * SCORE_WEIGHTS.media_documents),
      maxScore: SCORE_WEIGHTS.media_documents,
      isComplete: hasMinImages && hasHero
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
        {sectionScores.map((section) => (
          <div key={section.id} className="flex items-center gap-3 rounded-lg border p-3">
            <div className={cn(
              "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
              section.isComplete ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground"
            )}>
              {section.isComplete ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{section.title}</p>
            </div>
            <div className="flex-shrink-0 text-sm">
              <span className={section.isComplete ? "text-green-600" : "text-muted-foreground"}>{section.score}</span>
              <span className="text-muted-foreground">/{section.maxScore}</span>
            </div>
          </div>
        ))}
      </div>

      <Button size="lg" onClick={handleSubmit} disabled={isSubmitting} className="w-full gap-2">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {isSubmitting ? "Completing..." : "Complete Onboarding"}
      </Button>
    </div>
  );
}
