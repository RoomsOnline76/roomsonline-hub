import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getPMSFieldClass, isFieldPopulatedByPMS } from "@/lib/pmsFieldConfig";
import { cn } from "@/lib/utils";
import { ChannelFieldHint } from "@/components/property/ChannelFieldHint";
import { checkChannelTime } from "@/lib/channelFieldRules";
import { X, Check, Save, Cloud, Minus, Plus } from "lucide-react";

interface HouseRulesTabProps {
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  handleInputChange: (field: string, value: any) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isDirty: boolean;
  loading: boolean;
  setIsDirty: (v: boolean) => void;
  handleNavigate: (path: string) => void;
  selectedPMS: string;
  isRolProperty: boolean;
  cancellationPolicies: any[];
  setCancellationPolicies: (v: any[]) => void;
  addCancellationPolicy: () => void;
  removeCancellationPolicy: (i: number) => void;
  updateCancellationPolicy: (i: number, field: string, value: string) => void;
}

export function HouseRulesTab(props: HouseRulesTabProps) {
  const {
    formData, setFormData, handleInputChange, handleSubmit, isDirty, loading, setIsDirty,
    handleNavigate, selectedPMS, isRolProperty, cancellationPolicies,
    addCancellationPolicy, removeCancellationPolicy, updateCancellationPolicy,
  } = props;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-3 space-y-3">
          {/* Policy Toggles */}
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center space-x-1.5">
                  <Checkbox id="items_non_refundable" checked={formData.items_non_refundable} onCheckedChange={(c) => setFormData({ ...formData, items_non_refundable: c as boolean })} className="h-3.5 w-3.5" />
                  <Label htmlFor="items_non_refundable" className="cursor-pointer text-xs">Non Refundable</Label>
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
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center cursor-pointer ${formData[key as keyof typeof formData] ? "bg-green-500" : "bg-destructive"}`}
                      onClick={() => setFormData({ ...formData, [key]: !formData[key as keyof typeof formData] })}>
                      {formData[key as keyof typeof formData] ? <Check className="h-3 w-3 text-white" /> : <X className="h-3 w-3 text-white" />}
                    </div>
                    <span className="text-xs">{label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Cancellation Policies */}
          <Card>
            <CardHeader className="py-2 px-4"><CardTitle className="text-sm">Cancellation Policies</CardTitle></CardHeader>
            <CardContent className="py-2 px-4 space-y-1.5">
              {cancellationPolicies.map((policy, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Forfeit</span>
                  <Input value={policy.forfeit} onChange={(e) => updateCancellationPolicy(index, "forfeit", e.target.value)} className="h-6 text-xs w-14" placeholder="%" />
                  <Select value={policy.type} onValueChange={(v) => updateCancellationPolicy(index, "type", v)}>
                    <SelectTrigger className="h-6 text-xs w-28"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="% of Total" className="text-xs">% of Total</SelectItem><SelectItem value="Fixed Amount" className="text-xs">Fixed Amount</SelectItem></SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">if &lt;</span>
                  <Input value={policy.days} onChange={(e) => updateCancellationPolicy(index, "days", e.target.value)} className="h-6 text-xs w-14" placeholder="days" />
                  <span className="text-xs text-muted-foreground">days</span>
                  <Button type="button" size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeCancellationPolicy(index)}><Minus className="h-3 w-3" /></Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" className="h-6 text-xs" onClick={addCancellationPolicy}><Plus className="h-3 w-3 mr-1" />Add Policy</Button>
            </CardContent>
          </Card>

          {/* Children Policy & Special Requests */}
          <Card>
            <CardContent className="py-3 px-4 space-y-2">
              <div className="space-y-1">
                <Label htmlFor="children_policy" className="text-xs">Children Policy</Label>
                <Textarea id="children_policy" value={formData.children_policy} onChange={(e) => handleInputChange("children_policy", e.target.value)} rows={2} className="resize-none text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pets_policy" className="text-xs">Pets Policy</Label>
                  <Input id="pets_policy" value={formData.pets_policy} onChange={(e) => handleInputChange("pets_policy", e.target.value)} placeholder="e.g., No pets allowed" className="h-7 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="special_requests_message" className="text-xs">Special Requests Message</Label>
                  <Input id="special_requests_message" value={formData.special_requests_message} onChange={(e) => handleInputChange("special_requests_message", e.target.value)} placeholder="Message for special requests" className="h-7 text-xs" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="fine_print" className="text-xs">Fine Print</Label>
                <Textarea id="fine_print" value={formData.fine_print} onChange={(e) => handleInputChange("fine_print", e.target.value)} rows={2} className="resize-none text-xs" placeholder="Additional terms and conditions..." />
              </div>
            </CardContent>
          </Card>

          {/* Time and Age Settings */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {/* Deposit */}
            <Card>
              <CardHeader className="py-1.5 px-3"><CardTitle className="text-xs flex items-center gap-1.5">
                <Checkbox id="deposit_allowed" checked={formData.deposit_allowed} onCheckedChange={(c) => setFormData({ ...formData, deposit_allowed: c as boolean })} className="h-3 w-3" />Deposit
              </CardTitle></CardHeader>
              <CardContent className="py-1.5 px-3 space-y-1">
                <div className="flex items-center gap-1"><Input placeholder="50" value={formData.deposit_percentage} onChange={(e) => handleInputChange("deposit_percentage", e.target.value)} className="h-6 text-xs" /><span className="text-xs text-muted-foreground">%</span></div>
                <div className="flex items-center gap-1"><Input placeholder="2" value={formData.deposit_days} onChange={(e) => handleInputChange("deposit_days", e.target.value)} className="h-6 text-xs" /><span className="text-xs text-muted-foreground">days</span></div>
              </CardContent>
            </Card>

            {/* Same Day */}
            <Card>
              <CardHeader className="py-1.5 px-3"><CardTitle className="text-xs flex items-center gap-1.5">
                <Checkbox id="same_day_bookings" checked={formData.same_day_bookings} onCheckedChange={(c) => setFormData({ ...formData, same_day_bookings: c as boolean })} className="h-3 w-3" />Same Day
              </CardTitle></CardHeader>
              <CardContent className="py-1.5 px-3">
                <div className="flex items-center gap-1"><Label className="text-xs text-muted-foreground">Cutoff</Label><Input type="time" value={formData.same_day_cutoff} onChange={(e) => handleInputChange("same_day_cutoff", e.target.value)} className="h-6 text-xs flex-1" /></div>
              </CardContent>
            </Card>

            {/* Check-in/out */}
            {[
              { title: "Check-in", fromField: "check_in_from", toField: "check_in_to" },
              { title: "Check-out", fromField: "check_out_from", toField: "check_out_to" },
            ].map(({ title, fromField, toField }) => (
              <Card key={title}>
                <CardHeader className="py-1.5 px-3"><CardTitle className="text-xs">{title}</CardTitle></CardHeader>
                <CardContent className="py-1.5 px-3 space-y-1">
                  <div className="flex items-center gap-1"><Label className="text-xs text-muted-foreground w-8">From</Label><Input type="time" value={formData[fromField]} onChange={(e) => handleInputChange(fromField, e.target.value)} disabled={isFieldPopulatedByPMS(fromField, selectedPMS)} className={cn("h-6 text-xs flex-1", getPMSFieldClass(fromField, selectedPMS))} /></div>
                  <div className="flex items-center gap-1"><Label className="text-xs text-muted-foreground w-8">To</Label><Input type="time" value={formData[toField]} onChange={(e) => handleInputChange(toField, e.target.value)} disabled={isFieldPopulatedByPMS(toField, selectedPMS)} className={cn("h-6 text-xs flex-1", getPMSFieldClass(toField, selectedPMS))} /></div>
                  <ChannelFieldHint feedback={checkChannelTime(formData[fromField], `${title} from time`)} />
                </CardContent>
              </Card>
            ))}

            {/* Age ranges */}
            {[
              { title: "Infant", fromField: "infant_age_from", toField: "infant_age_to" },
              { title: "Teen", fromField: "teen_age_from", toField: "teen_age_to" },
              { title: "Children", fromField: "children_age_from", toField: "children_age_to" },
            ].map(({ title, fromField, toField }) => (
              <Card key={title}>
                <CardHeader className="py-1.5 px-3"><CardTitle className="text-xs flex items-center gap-1">{title}{selectedPMS === "benson" && !isRolProperty && <Cloud className="h-3 w-3 text-primary" />}</CardTitle></CardHeader>
                <CardContent className="py-1.5 px-3 flex gap-1">
                  <Input value={(formData as any)[fromField] || ""} onChange={(e) => handleInputChange(fromField, e.target.value)} disabled={selectedPMS === "benson"} className={cn("h-6 text-xs", selectedPMS === "benson" && "bg-muted")} placeholder="From" />
                  <Input value={(formData as any)[toField] || ""} onChange={(e) => handleInputChange(toField, e.target.value)} disabled={selectedPMS === "benson"} className={cn("h-6 text-xs", selectedPMS === "benson" && "bg-muted")} placeholder="To" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Additional Rules */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            <Card>
              <CardHeader className="py-1.5 px-3"><CardTitle className="text-xs">Age Restriction</CardTitle></CardHeader>
              <CardContent className="py-1.5 px-3">
                <div className="flex items-center gap-1"><Label className="text-xs text-muted-foreground whitespace-nowrap">Min Age</Label><Input value={formData.min_check_in_age} onChange={(e) => handleInputChange("min_check_in_age", e.target.value)} className="h-6 text-xs flex-1" placeholder="18" /></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-1.5 px-3"><CardTitle className="text-xs">Adult Rate Age</CardTitle></CardHeader>
              <CardContent className="py-1.5 px-3">
                <div className="flex items-center gap-1"><Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label><Input value={formData.child_adult_age} onChange={(e) => handleInputChange("child_adult_age", e.target.value)} className="h-6 text-xs flex-1" placeholder="12" /><span className="text-xs text-muted-foreground">yrs</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-1.5 px-3"><CardTitle className="text-xs flex items-center gap-1.5">
                <Checkbox id="cot_available" checked={formData.cot_available} onCheckedChange={(c) => setFormData({ ...formData, cot_available: c as boolean })} className="h-3 w-3" />Cot Available
              </CardTitle></CardHeader>
              <CardContent className="py-1.5 px-3 space-y-1">
                <div className="flex items-center gap-1"><Input value={formData.cot_age_from} onChange={(e) => handleInputChange("cot_age_from", e.target.value)} className="h-6 text-xs" placeholder="0" /><span className="text-xs">-</span><Input value={formData.cot_age_to} onChange={(e) => handleInputChange("cot_age_to", e.target.value)} className="h-6 text-xs" placeholder="2" /><span className="text-xs text-muted-foreground">yrs</span></div>
                <Input value={formData.cot_price} onChange={(e) => handleInputChange("cot_price", e.target.value)} className="h-6 text-xs" placeholder="Free" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-1.5 px-3"><CardTitle className="text-xs flex items-center gap-1.5">
                <Checkbox id="extra_beds_available" checked={formData.extra_beds_available} onCheckedChange={(c) => setFormData({ ...formData, extra_beds_available: c as boolean })} className="h-3 w-3" />Extra Beds
              </CardTitle></CardHeader>
              <CardContent className="py-1.5 px-3">
                <div className="flex items-center gap-1"><Label className="text-xs text-muted-foreground">Price</Label><Input value={formData.extra_bed_price} onChange={(e) => handleInputChange("extra_bed_price", e.target.value)} className="h-6 text-xs flex-1" placeholder="Amount" disabled={!formData.extra_beds_available} /></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-1.5 px-3"><CardTitle className="text-xs flex items-center gap-1.5">
                <Checkbox id="advance_notice_required" checked={formData.advance_notice_required} onCheckedChange={(c) => setFormData({ ...formData, advance_notice_required: c as boolean })} className="h-3 w-3" />Advance Notice
              </CardTitle></CardHeader>
              <CardContent className="py-1.5 px-3">
                <Input value={formData.advance_notice_details ?? ""} onChange={(e) => handleInputChange("advance_notice_details", e.target.value)} className="h-6 text-xs" placeholder="e.g., 48 hours before arrival" disabled={!formData.advance_notice_required} />
                <p className="text-[10px] text-muted-foreground mt-1">Guests must confirm arrival in advance</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right sidebar - Promo Codes placeholder */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="py-2 px-4"><CardTitle className="text-sm">Quick Summary</CardTitle></CardHeader>
            <CardContent className="py-2 px-4 text-xs space-y-1 text-muted-foreground">
              <p>Check-in: {formData.check_in_from} - {formData.check_in_to}</p>
              <p>Check-out: {formData.check_out_from} - {formData.check_out_to}</p>
              <p>Min age: {formData.min_check_in_age || "18"}</p>
              <p>Deposit: {formData.deposit_allowed ? `${formData.deposit_percentage}%` : "Not required"}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleNavigate("/admin/property-overview")}>Cancel</Button>
        {isDirty && <Button type="submit" size="sm" className="h-7 text-xs" disabled={loading}><Save className="mr-1 h-3 w-3" />{loading ? "Saving..." : "Save Property"}</Button>}
      </div>
    </form>
  );
}
