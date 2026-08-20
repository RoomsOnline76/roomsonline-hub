import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Check, X, Cloud } from "lucide-react";
import { channelMandatoryClass } from "@/lib/channelMandatoryFields";
import { markerFlags } from "@/lib/fieldMarkers";
import { stayTimeIssueFor } from "@/lib/stayTimes";
import { cn } from "@/lib/utils";

export interface HouseRulesCardProps {
  formData: Record<string, any>;
  setFormData: (next: Record<string, any>) => void;
  handleInputChange: (field: string, value: string) => void;
  selectedPMS: string;
  isRolProperty: boolean;
  isFieldPopulatedByPMS: (field: string, pms: string) => boolean;
  getPMSFieldClass: (field: string, pms: string) => string;
}

/**
 * House rules & stay terms — relocated from the retired
 * "Guest experience → Policies" section so all policy authoring lives in
 * Rates & Pricing → Policies.
 */
export const HouseRulesCard: React.FC<HouseRulesCardProps> = ({
  formData,
  setFormData,
  handleInputChange,
  selectedPMS,
  isRolProperty,
  isFieldPopulatedByPMS,
  getPMSFieldClass,
}) => {
  // The channel refuses check-out later than check-in from, so flag it while authoring.
  const checkInToIssue = stayTimeIssueFor(formData, "check_in_to");
  const checkOutIssue = stayTimeIssueFor(formData, "check_out_to");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
      <div className="lg:col-span-3 space-y-3">
        {/* Payment & Policy Toggles Row */}
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-1.5">
                <Checkbox
                  id="items_non_refundable"
                  checked={formData.items_non_refundable}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, items_non_refundable: checked as boolean })
                  }
                  className="h-3.5 w-3.5"
                />
                <Label htmlFor="items_non_refundable" className="cursor-pointer text-xs">
                  Non Refundable
                </Label>
              </div>
              <Separator orientation="vertical" className="h-5" />
              {[
                { key: "smoking_allowed", label: "Smoking" },
                { key: "pets_allowed", label: "Pets" },
                { key: "children_allowed", label: "Children" },
                { key: "parties_allowed", label: "Parties" },
                { key: "check_in_24h", label: "24h Check-in" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div
                    className={`h-5 w-5 rounded-full flex items-center justify-center cursor-pointer ${
                      formData[key] ? "bg-green-500" : "bg-destructive"
                    }`}
                    onClick={() => setFormData({ ...formData, [key]: !formData[key] })}
                  >
                    {formData[key] ? (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    ) : (
                      <X className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>
                  <span className="text-xs">{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Deposit, Same Day, Check-in/out, Age Ranges */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          <Card>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <Checkbox
                  id="deposit_allowed"
                  checked={formData.deposit_allowed}
                  onCheckedChange={(checked) => setFormData({ ...formData, deposit_allowed: checked as boolean })}
                  className="h-3 w-3"
                />
                Deposit
              </CardTitle>
            </CardHeader>
            <CardContent className="py-1.5 px-3 space-y-1">
              <div className="flex items-center gap-1">
                <Input
                  placeholder="50"
                  value={formData.deposit_percentage}
                  onChange={(e) => handleInputChange("deposit_percentage", e.target.value)}
                  className="h-6 text-xs"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  placeholder="2"
                  value={formData.deposit_days}
                  onChange={(e) => handleInputChange("deposit_days", e.target.value)}
                  className="h-6 text-xs"
                />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <Checkbox
                  id="same_day_bookings"
                  checked={formData.same_day_bookings}
                  onCheckedChange={(checked) => setFormData({ ...formData, same_day_bookings: checked as boolean })}
                  className="h-3 w-3"
                />
                Same Day
              </CardTitle>
            </CardHeader>
            <CardContent className="py-1.5 px-3">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground">Cutoff</Label>
                <Input
                  type="time"
                  value={formData.same_day_cutoff}
                  onChange={(e) => handleInputChange("same_day_cutoff", e.target.value)}
                  className="h-6 text-xs flex-1"
                />
              </div>
            </CardContent>
          </Card>

          <Card data-field="check_in_from" {...markerFlags(!!(formData.check_in_from || "").trim() && !!(formData.check_out_to || "").trim())}>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs">Check-in</CardTitle>

            </CardHeader>
            <CardContent className="py-1.5 px-3 space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground w-8">From</Label>
                <Input
                  type="time"
                  data-field="check_in_from_input"
                  value={formData.check_in_from}
                  onChange={(e) => handleInputChange("check_in_from", e.target.value)}
                  disabled={isFieldPopulatedByPMS("check_in_from", selectedPMS)}
                  className={cn("h-6 text-xs flex-1", getPMSFieldClass("check_in_from", selectedPMS), channelMandatoryClass("check_in_from"))}
                  {...markerFlags(!!(formData.check_in_from || "").trim())}
                />
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground w-8">To</Label>
                <Input
                  type="time"
                  value={formData.check_in_to}
                  onChange={(e) => handleInputChange("check_in_to", e.target.value)}
                  disabled={isFieldPopulatedByPMS("check_in_to", selectedPMS)}
                  className={cn(
                    "h-6 text-xs flex-1",
                    getPMSFieldClass("check_in_to", selectedPMS),
                    checkInToIssue && "border-destructive",
                  )}
                />
              </div>
              {checkInToIssue && (
                <p className="text-[10px] text-destructive leading-tight">{checkInToIssue}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs">Check-out</CardTitle>
            </CardHeader>
            <CardContent className="py-1.5 px-3 space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground w-8">From</Label>
                <Input
                  type="time"
                  value={formData.check_out_from}
                  onChange={(e) => handleInputChange("check_out_from", e.target.value)}
                  disabled={isFieldPopulatedByPMS("check_out_from", selectedPMS)}
                  className={cn("h-6 text-xs flex-1", getPMSFieldClass("check_out_from", selectedPMS))}
                />
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground w-8">To</Label>
                <Input
                  type="time"
                  data-field="check_out_until_input"
                  value={formData.check_out_to}
                  onChange={(e) => handleInputChange("check_out_to", e.target.value)}
                  disabled={isFieldPopulatedByPMS("check_out_to", selectedPMS)}
                  className={cn(
                    "h-6 text-xs flex-1",
                    getPMSFieldClass("check_out_to", selectedPMS),
                    channelMandatoryClass("check_out_until"),
                    checkOutIssue && "border-destructive",
                  )}
                  {...markerFlags(!!(formData.check_out_to || "").trim())}
                />
              </div>
              {checkOutIssue && (
                <p className="text-[10px] text-destructive leading-tight">{checkOutIssue}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs flex items-center gap-1">
                Infant
                {selectedPMS === "benson" && !isRolProperty && <Cloud className="h-3 w-3 text-primary" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="py-1.5 px-3 flex gap-1">
              <Input
                value={formData.infant_age_from}
                onChange={(e) => handleInputChange("infant_age_from", e.target.value)}
                disabled={selectedPMS === "benson"}
                className={cn("h-6 text-xs", selectedPMS === "benson" && "bg-muted")}
                placeholder="From"
              />
              <Input
                value={formData.infant_age_to}
                onChange={(e) => handleInputChange("infant_age_to", e.target.value)}
                disabled={selectedPMS === "benson"}
                className={cn("h-6 text-xs", selectedPMS === "benson" && "bg-muted")}
                placeholder="To"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs flex items-center gap-1">
                Teen
                {selectedPMS === "benson" && !isRolProperty && <Cloud className="h-3 w-3 text-primary" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="py-1.5 px-3 flex gap-1">
              <Input
                value={formData.teen_age_from || ""}
                onChange={(e) => handleInputChange("teen_age_from", e.target.value)}
                disabled={selectedPMS === "benson"}
                className={cn("h-6 text-xs", selectedPMS === "benson" && "bg-muted")}
                placeholder="From"
              />
              <Input
                value={formData.teen_age_to || ""}
                onChange={(e) => handleInputChange("teen_age_to", e.target.value)}
                disabled={selectedPMS === "benson"}
                className={cn("h-6 text-xs", selectedPMS === "benson" && "bg-muted")}
                placeholder="To"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs flex items-center gap-1">
                Children
                {selectedPMS === "benson" && !isRolProperty && <Cloud className="h-3 w-3 text-primary" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="py-1.5 px-3 flex gap-1">
              <Input
                value={formData.children_age_from}
                onChange={(e) => handleInputChange("children_age_from", e.target.value)}
                disabled={selectedPMS === "benson"}
                className={cn("h-6 text-xs", selectedPMS === "benson" && "bg-muted")}
                placeholder="From"
              />
              <Input
                value={formData.children_age_to}
                onChange={(e) => handleInputChange("children_age_to", e.target.value)}
                disabled={selectedPMS === "benson"}
                className={cn("h-6 text-xs", selectedPMS === "benson" && "bg-muted")}
                placeholder="To"
              />
            </CardContent>
          </Card>
        </div>

        <div id="guest-policies" className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold">Guest Policies</h3>
            <p className="text-xs text-muted-foreground">
              Same fields as Website wizard → Policies &amp; Pricing → Guest Policies.
            </p>
          </div>
        </div>

        {/* Age restriction, pets, cot & extra beds */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          <Card>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs">Age Restriction</CardTitle>
            </CardHeader>
            <CardContent className="py-1.5 px-3">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Min Age</Label>
                <Input
                  value={formData.min_check_in_age}
                  onChange={(e) => handleInputChange("min_check_in_age", e.target.value)}
                  className="h-6 text-xs flex-1"
                  placeholder="18"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs">Adult Rate Age</CardTitle>
            </CardHeader>
            <CardContent className="py-1.5 px-3">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                <Input
                  value={formData.child_adult_age}
                  onChange={(e) => handleInputChange("child_adult_age", e.target.value)}
                  className="h-6 text-xs flex-1"
                  placeholder="12"
                />
                <span className="text-xs text-muted-foreground">yrs</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <Checkbox
                  id="cot_available"
                  checked={formData.cot_available}
                  onCheckedChange={(checked) => setFormData({ ...formData, cot_available: checked as boolean })}
                  className="h-3 w-3"
                />
                Cot Available
              </CardTitle>
            </CardHeader>
            <CardContent className="py-1.5 px-3 space-y-1">
              <div className="flex items-center gap-1">
                <Input
                  value={formData.cot_age_from}
                  onChange={(e) => handleInputChange("cot_age_from", e.target.value)}
                  className="h-6 text-xs"
                  placeholder="0"
                />
                <span className="text-xs">-</span>
                <Input
                  value={formData.cot_age_to}
                  onChange={(e) => handleInputChange("cot_age_to", e.target.value)}
                  className="h-6 text-xs"
                  placeholder="2"
                />
                <span className="text-xs text-muted-foreground">yrs</span>
              </div>
              <Input
                value={formData.cot_price}
                onChange={(e) => handleInputChange("cot_price", e.target.value)}
                className="h-6 text-xs"
                placeholder="Free"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <Checkbox
                  id="extra_beds_available"
                  checked={formData.extra_beds_available}
                  onCheckedChange={(checked) => setFormData({ ...formData, extra_beds_available: checked as boolean })}
                  className="h-3 w-3"
                />
                Extra Beds
              </CardTitle>
            </CardHeader>
            <CardContent className="py-1.5 px-3">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground">Price</Label>
                <Input
                  value={formData.extra_bed_price}
                  onChange={(e) => handleInputChange("extra_bed_price", e.target.value)}
                  className="h-6 text-xs flex-1"
                  placeholder="Amount"
                  disabled={!formData.extra_beds_available}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <Checkbox
                  id="advance_notice_required"
                  checked={formData.advance_notice_required}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, advance_notice_required: checked as boolean })
                  }
                  className="h-3 w-3"
                />
                Advance Notice
              </CardTitle>
            </CardHeader>
            <CardContent className="py-1.5 px-3">
              <p className="text-xs text-muted-foreground">Guest must notify arrival time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-xs">Pets Policy</CardTitle>
            </CardHeader>
            <CardContent className="py-1.5 px-3">
              <Input
                value={formData.pets_policy}
                onChange={(e) => handleInputChange("pets_policy", e.target.value)}
                className="h-6 text-xs"
                placeholder="e.g., Pets are not allowed"
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs">Special Requests Message</CardTitle>
          </CardHeader>
          <CardContent className="py-2 px-3">
            <Textarea
              value={formData.special_requests_message}
              onChange={(e) => handleInputChange("special_requests_message", e.target.value)}
              placeholder="e.g., Property takes special requests - add in the next step!"
              rows={2}
              className="resize-none text-xs"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs">The Fine Print</CardTitle>
            <p className="text-xs text-muted-foreground">Need-to-know information for guests</p>
          </CardHeader>
          <CardContent className="py-2 px-3">
            <Textarea
              value={formData.fine_print}
              onChange={(e) => handleInputChange("fine_print", e.target.value)}
              placeholder="e.g., Please inform the property in advance of your expected arrival time."
              rows={3}
              className="resize-none text-xs"
            />
          </CardContent>
        </Card>
      </div>

      {/* Children Policy */}
      <div>
        <Card className="sticky top-4">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm">Children Policy</CardTitle>
          </CardHeader>
          <CardContent className="py-2 px-3">
            <Textarea
              value={formData.children_policy}
              onChange={(e) => handleInputChange("children_policy", e.target.value)}
              placeholder="Enter children policy details..."
              rows={6}
              className="resize-none text-xs"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
