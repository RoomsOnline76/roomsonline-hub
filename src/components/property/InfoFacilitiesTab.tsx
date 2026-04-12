import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StarRating } from "@/components/StarRating";
import { ACCOMMODATION_LABEL_OPTIONS, getAccommodationLabel } from "@/lib/accommodationLabels";
import { getPMSFieldClass, getPMSDisplayName, isFieldPopulatedByPMS } from "@/lib/pmsFieldConfig";
import { cn } from "@/lib/utils";
import { X, Save, Cloud } from "lucide-react";

const FACILITIES = {
  general: ["Wheelchair Accessible","Non-Smoking Rooms","Designated Smoking Area","Garden","Terrace/Patio","Fireplace Lounge","Lift/Elevator"],
  businessReception: ["24-Hour Front Desk","Wake-Up Service","Safety Deposit Box","Currency Exchange","Ticket Service","Porter/Bell Service","Express Check-Out","Concierge Service"],
  conferenceEvents: ["Banquet Hall","Event Space","Wedding Facilities","Audio-Visual Equipment","Projector","Screen","Event Catering"],
  mealsDining: ["Breakfast Available (Paid)","Lunch Available","Dinner Available","Special Diet Menus on Request","BBQ/Braai Facilities","Packed Lunches","Restaurant","Bar","Wine Cellar","Room Service"],
  utilityRoom: ["Backup Power Generator","Solar Power","Inverter Power","Iron & Ironing Board","In-Room Safe","Desk/Workspace","Wardrobe/Closet","Free WiFi","Air Conditioning","Heating","Laundry Service","Electric Kettle"],
  wellnessFitness: ["Fitness Centre","Sauna","Steam Room","Hot Tub/Jacuzzi","Yoga Classes","Spa","Outdoor Swimming Pool","Indoor Swimming Pool","Full Body Massage","Couples Massage"],
  activitiesExperiences: ["Game Drives (Morning)","Game Drives (Evening)","Guided Safari Walks","Bird Watching","Cycling","Fishing","Cultural Tours","Hiking Trails","Airport Transfer","Walking Tours","Live Music/Performance"],
  familyServices: ["Children Play Area","Kids Meals","Child-Friendly Activities","Family Rooms","Babysitting/Child Services"],
  safetySecurity: ["24-Hour Security","CCTV","Fire Extinguishers","First Aid Kit"],
  view: ["Sea View","Mountain View","Garden View","Pool View","City View","Lake View","River View","Courtyard View"],
  languagesSpoken: ["English","Afrikaans","Other Languages"],
  transportParking: ["On-Site Parking","Free Secure Parking","Nearby Parking","Car Hire Assistance","Airport Shuttle"],
};

const FACILITY_LABELS: Record<string, string> = {
  general: "General", businessReception: "Business & Reception", conferenceEvents: "Conference & Events",
  mealsDining: "Meals & Dining", utilityRoom: "Utility & Room Features", wellnessFitness: "Wellness & Fitness",
  activitiesExperiences: "Activities & Experiences", familyServices: "Family Services",
  safetySecurity: "Safety & Security", view: "View",
  languagesSpoken: "Languages Spoken", transportParking: "Transport & Parking",
};

interface InfoFacilitiesTabProps {
  formData: any;
  handleInputChange: (field: string, value: any) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isDirty: boolean;
  loading: boolean;
  setIsDirty: (v: boolean) => void;
  handleNavigate: (path: string) => void;
  selectedPMS: string;
  isRolProperty: boolean;
  starRating: number;
  setStarRating: (v: number) => void;
  selectedFacilities: string[];
  toggleFacility: (f: string) => void;
  accommodationLabel: string;
  setAccommodationLabel: (v: string) => void;
  isSelfCatering: boolean;
  setIsSelfCatering: (v: boolean) => void;
  selectedBreakfastOptions: string[];
  setSelectedBreakfastOptions: (v: string[]) => void;
}

export function InfoFacilitiesTab(props: InfoFacilitiesTabProps) {
  const {
    formData, handleInputChange, handleSubmit, isDirty, loading, setIsDirty, handleNavigate,
    selectedPMS, isRolProperty, starRating, setStarRating, selectedFacilities, toggleFacility,
    accommodationLabel, setAccommodationLabel, isSelfCatering, setIsSelfCatering,
    selectedBreakfastOptions, setSelectedBreakfastOptions,
  } = props;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Card>
        <CardHeader className="py-2 px-4">
          <CardTitle className="text-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>Property Info</span>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Stars</Label>
                <div className={cn("inline-block", getPMSFieldClass("star_rating", selectedPMS), isFieldPopulatedByPMS("star_rating", selectedPMS) && "opacity-60 pointer-events-none")}>
                  <StarRating rating={starRating} onRatingChange={isFieldPopulatedByPMS("star_rating", selectedPMS) ? () => {} : setStarRating} />
                </div>
              </div>
            </div>
            {selectedPMS && !isRolProperty && (
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <div className="flex items-center gap-2 text-xs font-normal"><div className="w-3 h-3 rounded bg-primary/10 border border-primary/30" /><span className="text-muted-foreground"><Cloud className="inline h-3 w-3 mr-1" />{getPMSDisplayName(selectedPMS)} synced</span></div>
              </TooltipTrigger><TooltipContent><p>Fields with this background are populated by {getPMSDisplayName(selectedPMS)}</p></TooltipContent></Tooltip></TooltipProvider>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-4">
          <div className="space-y-1">
            <Label htmlFor="description" className="text-xs">Description</Label>
            <Textarea id="description" value={formData.description} onChange={(e) => handleInputChange("description", e.target.value)} placeholder="Describe your property..." rows={3} disabled={isFieldPopulatedByPMS("description", selectedPMS)} className={cn("resize-none text-xs", getPMSFieldClass("description", selectedPMS), isFieldPopulatedByPMS("description", selectedPMS) && "cursor-not-allowed")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-2 px-4"><CardTitle className="text-sm">Accommodation Settings</CardTitle></CardHeader>
        <CardContent className="py-2 px-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="accommodation_label" className="text-xs">Accommodation Label</Label>
              <p className="text-[10px] text-muted-foreground mb-1">How "rooms" are referred to on your listing</p>
              <Select value={accommodationLabel || getAccommodationLabel({ property_type: formData.property_type, external_system: selectedPMS || null }).key} onValueChange={(v) => { setAccommodationLabel(v); setIsDirty(true); }}>
                <SelectTrigger id="accommodation_label" className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{ACCOMMODATION_LABEL_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="self_catering" className="text-xs">Self Catering</Label>
              <p className="text-[10px] text-muted-foreground mb-1">Property offers self-catering accommodation</p>
              <div className="flex items-center gap-2 pt-1">
                <Switch id="self_catering" checked={isSelfCatering} onCheckedChange={(c) => { setIsSelfCatering(c); setIsDirty(true); }} />
                <Label htmlFor="self_catering" className="text-xs cursor-pointer">{isSelfCatering ? "Yes" : "No"}</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-2 px-4"><CardTitle className="text-sm">Facilities & Amenities</CardTitle></CardHeader>
        <CardContent className="py-2 px-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(FACILITIES).map(([key, items]) => (
              <div key={key}>
                <h3 className="font-semibold mb-1 text-xs text-muted-foreground">{FACILITY_LABELS[key]}</h3>
                <div className="space-y-0.5">
                  {items.map(facility => (
                    <div key={facility} className="flex items-center space-x-1.5">
                      <Checkbox id={facility} checked={selectedFacilities.includes(facility)} onCheckedChange={() => toggleFacility(facility)} className="h-3 w-3" />
                      <Label htmlFor={facility} className="cursor-pointer text-xs leading-none">{facility}</Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {selectedFacilities.length > 0 && (
            <div className="pt-2 mt-2 border-t">
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-xs text-muted-foreground">Selected:</Label>
                {selectedFacilities.map(f => (
                  <Badge key={f} variant="secondary" className="text-xs h-5 gap-1">{f}<button type="button" onClick={() => toggleFacility(f)} className="ml-0.5 hover:text-destructive"><X className="h-2.5 w-2.5" /></button></Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-2 px-4"><CardTitle className="text-sm">Breakfast Options</CardTitle></CardHeader>
        <CardContent className="py-2 px-4">
          <div className="flex flex-wrap gap-3">
            {["Continental","Full English/Irish","Vegetarian","Vegan","Halal","Gluten-free","Buffet"].map(option => (
              <div key={option} className="flex items-center space-x-1.5">
                <Checkbox id={`breakfast-${option}`} checked={selectedBreakfastOptions.includes(option)} onCheckedChange={(c) => { setSelectedBreakfastOptions(c ? [...selectedBreakfastOptions, option] : selectedBreakfastOptions.filter(o => o !== option)); setIsDirty(true); }} className="h-3.5 w-3.5" />
                <Label htmlFor={`breakfast-${option}`} className="cursor-pointer text-xs">{option}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleNavigate("/admin/property-overview")}>Cancel</Button>
        {isDirty && <Button type="submit" size="sm" className="h-7 text-xs" disabled={loading}><Save className="mr-1 h-3 w-3" />{loading ? "Saving..." : "Save Property"}</Button>}
      </div>
    </form>
  );
}
