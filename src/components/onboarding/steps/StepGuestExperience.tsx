import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, Loader2, AlertTriangle, Utensils } from "lucide-react";
import { StepProps } from "./types";
import { MEAL_PLAN_OPTIONS } from "@/config/onboardingFieldSchema";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const MEAL_PLAN_LABELS: Record<string, string> = {
  all_inclusive: "All Inclusive",
  room_only: "Room Only",
  bed_and_breakfast: "B&B",
  half_board: "Half Board",
  full_board: "Full Board",
  self_catering: "Self Catering",
  bbq: "BBQ/Braai",
  packed_lunch: "Packed Lunch",
  other: "Other"
};

export function StepGuestExperience({
  propertyData,
  updateField,
  isPMSManaged,
  getAmenityValue
}: StepProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const isPMSDesc = isPMSManaged("description");
  const mealPlan = getAmenityValue<string[]>("meal_plan", []);
  const description = propertyData.description || "";
  const charCount = description.length;

  const handleAIEnhance = async () => {
    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("editorial-ai-assist", {
        body: {
          action: "enhance_description",
          content: description,
          context: {
            name: propertyData.name,
            property_type: propertyData.property_type,
            city: propertyData.city,
            country: propertyData.country
          }
        }
      });

      if (error) throw error;

      if (data?.enhanced) {
        updateField("description", data.enhanced);
        toast({
          title: "Description enhanced",
          description: "Your description has been improved with AI"
        });
      }
    } catch (error) {
      console.error("AI enhancement error:", error);
      toast({
        title: "Enhancement failed",
        description: "Could not enhance description",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMealPlanChange = (option: string, checked: boolean) => {
    const newMealPlan = checked
      ? [...mealPlan, option]
      : mealPlan.filter(m => m !== option);
    updateField("amenities.meal_plan", newMealPlan);
  };

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="description" className="flex items-center gap-2">
            Property Description
            {isPMSDesc && <AlertTriangle className="h-3 w-3 text-amber-600" />}
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAIEnhance}
            disabled={isGenerating || !description}
            className="gap-1.5 h-8"
          >
            {isGenerating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Enhance
          </Button>
        </div>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="Describe your property - what makes it special, unique features, the atmosphere, and what guests can expect..."
          rows={6}
          className="resize-y min-h-[150px]"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Aim for 150-300 words</span>
          <span className={charCount > 300 ? "text-amber-600" : ""}>{charCount} chars</span>
        </div>
      </div>

      {/* Meal Plans */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Utensils className="h-4 w-4 text-primary" />
          <Label>Meal Options</Label>
          <span className="text-xs text-muted-foreground">({mealPlan.length} selected)</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {MEAL_PLAN_OPTIONS.map((option) => (
            <div
              key={option}
              className="flex items-center space-x-2 rounded-lg border p-2.5 hover:bg-muted/30 transition-colors"
            >
              <Checkbox
                id={`meal-${option}`}
                checked={mealPlan.includes(option)}
                onCheckedChange={(checked) => handleMealPlanChange(option, checked === true)}
              />
              <Label
                htmlFor={`meal-${option}`}
                className="cursor-pointer text-sm"
              >
                {MEAL_PLAN_LABELS[option] || option}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* PMS Warning */}
      {isPMSDesc && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            Description might be managed by your PMS. Changes may be overwritten during sync.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
