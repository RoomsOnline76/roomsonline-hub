import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { StepProps } from "./types";

export function StepPolicies({
  updateField,
  getAmenityValue
}: StepProps) {
  const minCheckInAge = getAmenityValue<number | null>("min_check_in_age", null);
  const childAdultAge = getAmenityValue<number | null>("child_adult_age", null);
  const petsAllowed = getAmenityValue<boolean>("pets_allowed", false);
  const petsPolicy = getAmenityValue<string>("pets_policy", "");
  const paymentPolicy = getAmenityValue<string>("payment_policy", "");

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        Define the policies that govern your property. Clear policies help set 
        guest expectations and prevent misunderstandings.
      </p>

      {/* Age Policies */}
      <div className="space-y-4">
        <h3 className="font-medium">Age Policies</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="min_check_in_age">Minimum Check-in Age</Label>
            <Input
              id="min_check_in_age"
              type="number"
              min={0}
              max={99}
              value={minCheckInAge || ""}
              onChange={(e) => updateField("amenities.min_check_in_age", e.target.value ? parseInt(e.target.value) : null)}
              placeholder="18"
            />
            <p className="text-xs text-muted-foreground">
              Minimum age required to check in as the primary guest
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="child_adult_age">Child/Adult Age Threshold</Label>
            <Input
              id="child_adult_age"
              type="number"
              min={0}
              max={99}
              value={childAdultAge || ""}
              onChange={(e) => updateField("amenities.child_adult_age", e.target.value ? parseInt(e.target.value) : null)}
              placeholder="12"
            />
            <p className="text-xs text-muted-foreground">
              Age at which a child is charged as an adult
            </p>
          </div>
        </div>
      </div>

      {/* Pet Policy */}
      <div className="space-y-4">
        <h3 className="font-medium">Pet Policy</h3>
        
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="pets_allowed" className="text-base font-medium cursor-pointer">
              Pets Allowed
            </Label>
            <p className="text-sm text-muted-foreground">
              Do you accept guests with pets?
            </p>
          </div>
          <Switch
            id="pets_allowed"
            checked={petsAllowed}
            onCheckedChange={(checked) => updateField("amenities.pets_allowed", checked)}
          />
        </div>

        {petsAllowed && (
          <div className="space-y-2">
            <Label htmlFor="pets_policy">Pet Policy Details</Label>
            <Textarea
              id="pets_policy"
              value={petsPolicy}
              onChange={(e) => updateField("amenities.pets_policy", e.target.value)}
              placeholder="Describe your pet policy (e.g., size restrictions, additional fees, allowed areas)"
              rows={3}
            />
          </div>
        )}
      </div>

      {/* Payment Policy */}
      <div className="space-y-4">
        <h3 className="font-medium">Payment Policy</h3>
        
        <div className="space-y-2">
          <Label htmlFor="payment_policy">Payment Terms</Label>
          <Textarea
            id="payment_policy"
            value={paymentPolicy}
            onChange={(e) => updateField("amenities.payment_policy", e.target.value)}
            placeholder="Describe your payment terms (e.g., deposit requirements, payment methods, refund conditions)"
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            Include information about deposits, accepted payment methods, and when full payment is due.
          </p>
        </div>
      </div>

      {/* Tips */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="font-medium text-sm mb-2">Best Practices</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Be specific about pet size limits and breeds if applicable</li>
          <li>• Clearly state any additional cleaning or pet fees</li>
          <li>• Include information about deposits and cancellation</li>
        </ul>
      </div>
    </div>
  );
}
