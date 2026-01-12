import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { StepProps } from "./types";
import { MEAL_PLAN_OPTIONS } from "@/config/onboardingFieldSchema";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const MEAL_PLAN_LABELS: Record<string, string> = {
  all_inclusive: "All Inclusive",
  room_only: "Room Only",
  bed_and_breakfast: "Bed & Breakfast",
  half_board: "Half Board",
  full_board: "Full Board",
  self_catering: "Self Catering",
  bbq: "BBQ/Braai Facilities",
  packed_lunch: "Packed Lunches",
  other: "Other"
};

export function StepDescription({
  propertyData,
  updateField,
  isPMSManaged,
  getAmenityValue
}: StepProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const isPMSDesc = isPMSManaged("description");
  const mealPlan = getAmenityValue<string[]>("meal_plan", []);

  const handleAIEnhance = async () => {
    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("editorial-ai-assist", {
        body: {
          action: "enhance_description",
          content: propertyData.description || "",
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
          description: "Your description has been improved with AI suggestions"
        });
      }
    } catch (error) {
      console.error("AI enhancement error:", error);
      toast({
        title: "Enhancement failed",
        description: "Could not enhance description. Please try again.",
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
    <div className="space-y-8">
      <p className="text-muted-foreground">
        Write a compelling description of your property and specify what meal 
        options you offer to guests.
      </p>

      {/* Description */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="description" className="flex items-center gap-2">
            Property Description
            {isPMSDesc && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                PMS managed
              </span>
            )}
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAIEnhance}
            disabled={isGenerating || !propertyData.description}
            className="gap-1.5"
          >
            {isGenerating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Enhance with AI
          </Button>
        </div>
        <Textarea
          id="description"
          value={propertyData.description || ""}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="Describe your property - what makes it special, unique features, the atmosphere, and what guests can expect..."
          rows={8}
          className="resize-y min-h-[200px]"
        />
        <p className="text-xs text-muted-foreground">
          A good description is 150-300 words and highlights what makes your property unique.
        </p>
      </div>

      {/* Meal Plans */}
      <div className="space-y-4">
        <h3 className="font-medium">Meal Options</h3>
        <p className="text-sm text-muted-foreground">
          Select all meal options available at your property.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MEAL_PLAN_OPTIONS.map((option) => (
            <div
              key={option}
              className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
            >
              <Checkbox
                id={`meal-${option}`}
                checked={mealPlan.includes(option)}
                onCheckedChange={(checked) => handleMealPlanChange(option, checked === true)}
              />
              <Label
                htmlFor={`meal-${option}`}
                className="cursor-pointer text-sm font-medium"
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
            Description is managed by your PMS. Changes may be overwritten during sync.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
