import { useState, useEffect } from "react";
import { usePropertyRoomTypes } from "@/hooks/usePropertyRoomTypes";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Loader2 } from "lucide-react";
import type { 
  PropertyCharge, 
  ChargePreset, 
  ChargeCategory, 
  ChargeCalculationMethod,
  RevenueStream
} from "./ChargeCalculator";
import { getCalculationMethodLabel, getCategoryLabel, getRevenueStreamLabel, REVENUE_STREAMS, normalizeRevenueStream } from "./ChargeCalculator";

interface ChargeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charge?: PropertyCharge | null;
  presets: ChargePreset[];
  propertyId: string;
  onSave: (charge: Omit<PropertyCharge, 'id' | 'created_at' | 'updated_at'>) => void;
  isSaving?: boolean;
}

const DEFAULT_CHARGE: Omit<PropertyCharge, 'id' | 'property_id' | 'created_at' | 'updated_at'> = {
  name: '',
  internal_code: '',
  category: 'fee',
  revenue_stream: 'accommodation',
  is_included_in_rate: false,
  calculation_method: 'flat_per_stay',
  amount: 0,
  currency: 'ZAR',
  percentage_apply_to: 'subtotal',
  min_cap: null,
  max_cap: null,
  applies_to_all_rooms: true,
  room_type_ids: [],
  rate_type_ids: [],
  room_charge_overrides: {},
  min_nights: 0,
  max_nights: 0,
  applies_to_adults: true,
  applies_to_children: false,
  applies_to_infants: false,
  is_refundable: false,
  refund_timing: null,
  refund_type: null,
  partial_refund_percentage: null,
  description: '',
  display_order: 0,
  is_active: true,
  pms_external_id: null,
};

const CALCULATION_METHODS: ChargeCalculationMethod[] = [
  'flat_per_stay',
  'per_night',
  'per_room_per_night',
  'per_person',
  'per_person_per_night',
  'percentage_of_accommodation',
];

const CATEGORIES: ChargeCategory[] = ['tax', 'fee', 'deposit', 'surcharge', 'custom'];

export function ChargeEditor({
  open,
  onOpenChange,
  charge,
  presets,
  propertyId,
  onSave,
  isSaving,
}: ChargeEditorProps) {
  const [formData, setFormData] = useState(DEFAULT_CHARGE);
  const [refundOpen, setRefundOpen] = useState(false);
  const isEditing = !!charge;

  // Fetch room types for this property using shared fallback chain
  const { data: roomTypes = [] } = usePropertyRoomTypes(propertyId);

  useEffect(() => {
    if (charge) {
      setFormData({
        name: charge.name,
        internal_code: charge.internal_code || '',
        category: charge.category,
        revenue_stream: normalizeRevenueStream(charge.revenue_stream),
        is_included_in_rate: charge.is_included_in_rate ?? false,
        calculation_method: charge.calculation_method,
        amount: charge.amount,
        currency: charge.currency,
        percentage_apply_to: charge.percentage_apply_to || 'subtotal',
        min_cap: charge.min_cap,
        max_cap: charge.max_cap,
        applies_to_all_rooms: charge.applies_to_all_rooms,
        room_type_ids: charge.room_type_ids || [],
        rate_type_ids: charge.rate_type_ids || [],
        room_charge_overrides: charge.room_charge_overrides || {},
        min_nights: charge.min_nights,
        max_nights: charge.max_nights,
        applies_to_adults: charge.applies_to_adults,
        applies_to_children: charge.applies_to_children,
        applies_to_infants: charge.applies_to_infants,
        is_refundable: charge.is_refundable,
        refund_timing: charge.refund_timing,
        refund_type: charge.refund_type,
        partial_refund_percentage: charge.partial_refund_percentage,
        description: charge.description || '',
        display_order: charge.display_order,
        is_active: charge.is_active,
        pms_external_id: charge.pms_external_id,
      });
      setRefundOpen(charge.is_refundable);
    } else {
      setFormData(DEFAULT_CHARGE);
      setRefundOpen(false);
    }
  }, [charge, open]);

  const handlePresetSelect = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setFormData(prev => ({
        ...prev,
        name: preset.name,
        category: preset.category as ChargeCategory,
        calculation_method: (preset.default_calculation_method || 'flat_per_stay') as ChargeCalculationMethod,
        description: preset.default_description || '',
        internal_code: preset.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        is_refundable: preset.category === 'deposit',
      }));
      if (preset.category === 'deposit') {
        setRefundOpen(true);
      }
    }
  };

  const handleSave = () => {
    onSave({
      ...formData,
      property_id: propertyId,
      internal_code: formData.internal_code || formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    });
  };

  const isPercentage = formData.calculation_method === 'percentage_of_accommodation';
  const isPersonBased = ['per_person', 'per_person_per_night'].includes(formData.calculation_method);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit Charge' : 'Add Charge'}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="basic" className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="calculation">Calculation</TabsTrigger>
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="space-y-4 mt-4">
            {!isEditing && presets.length > 0 && (
              <div className="space-y-2">
                <Label>Quick Select Preset</Label>
                <Select onValueChange={handlePresetSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a preset or enter custom..." />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map(preset => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name} ({getCategoryLabel(preset.category as ChargeCategory)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Cleaning Fee"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select 
                value={formData.category} 
                onValueChange={val => setFormData(prev => ({ ...prev, category: val as ChargeCategory }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{getCategoryLabel(cat)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="revenue_stream">Revenue stream *</Label>
              <Select
                value={formData.revenue_stream}
                onValueChange={val => setFormData(prev => ({ ...prev, revenue_stream: val as RevenueStream }))}
              >
                <SelectTrigger id="revenue_stream">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVENUE_STREAMS.map(stream => (
                    <SelectItem key={stream} value={stream}>{getRevenueStreamLabel(stream)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used for reporting only — lets you separate accommodation revenue from F&amp;B (e.g. breakfast).
              </p>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
              <div className="space-y-1">
                <Label htmlFor="is_included_in_rate">Included in rate</Label>
                <p className="text-xs text-muted-foreground">
                  The amount already sits inside the room rate. It is used to split revenue only and is never added on top of the guest total.
                </p>
              </div>
              <Switch
                id="is_included_in_rate"
                checked={formData.is_included_in_rate}
                onCheckedChange={checked => setFormData(prev => ({ ...prev, is_included_in_rate: checked }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description shown to guests..."
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={checked => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </TabsContent>

          {/* Calculation Tab */}
          <TabsContent value="calculation" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Calculation Method *</Label>
              <Select 
                value={formData.calculation_method} 
                onValueChange={val => setFormData(prev => ({ 
                  ...prev, 
                  calculation_method: val as ChargeCalculationMethod 
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CALCULATION_METHODS.map(method => (
                    <SelectItem key={method} value={method}>
                      {getCalculationMethodLabel(method)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">
                  {isPercentage ? 'Percentage (%)' : 'Amount'} *
                </Label>
                <Input
                  id="amount"
                  type="number"
                  step={isPercentage ? '0.01' : '1'}
                  min="0"
                  value={formData.amount}
                  onChange={e => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                />
              </div>

              {!isPercentage && (
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select 
                    value={formData.currency} 
                    onValueChange={val => setFormData(prev => ({ ...prev, currency: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ZAR">ZAR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {isPercentage && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="min_cap">Min Cap</Label>
                    <Input
                      id="min_cap"
                      type="number"
                      min="0"
                      value={formData.min_cap || ''}
                      onChange={e => setFormData(prev => ({ 
                        ...prev, 
                        min_cap: e.target.value ? parseFloat(e.target.value) : null 
                      }))}
                      placeholder="No minimum"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_cap">Max Cap</Label>
                    <Input
                      id="max_cap"
                      type="number"
                      min="0"
                      value={formData.max_cap || ''}
                      onChange={e => setFormData(prev => ({ 
                        ...prev, 
                        max_cap: e.target.value ? parseFloat(e.target.value) : null 
                      }))}
                      placeholder="No maximum"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Refund Settings */}
            <Collapsible open={refundOpen} onOpenChange={setRefundOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  Refund Settings
                  <ChevronDown className={`h-4 w-4 transition-transform ${refundOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_refundable">Is Refundable</Label>
                  <Switch
                    id="is_refundable"
                    checked={formData.is_refundable}
                    onCheckedChange={checked => setFormData(prev => ({ ...prev, is_refundable: checked }))}
                  />
                </div>

                {formData.is_refundable && (
                  <>
                    <div className="space-y-2">
                      <Label>Refund Timing</Label>
                      <Select 
                        value={formData.refund_timing || ''} 
                        onValueChange={val => setFormData(prev => ({ 
                          ...prev, 
                          refund_timing: val as PropertyCharge['refund_timing'] 
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select timing..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="on_checkout">On Checkout</SelectItem>
                          <SelectItem value="after_inspection">After Inspection</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Refund Type</Label>
                      <Select 
                        value={formData.refund_type || ''} 
                        onValueChange={val => setFormData(prev => ({ 
                          ...prev, 
                          refund_type: val as PropertyCharge['refund_type'] 
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full">Full Refund</SelectItem>
                          <SelectItem value="partial">Partial Refund</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.refund_type === 'partial' && (
                      <div className="space-y-2">
                        <Label htmlFor="partial_refund_percentage">Refund Percentage (%)</Label>
                        <Input
                          id="partial_refund_percentage"
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={formData.partial_refund_percentage || ''}
                          onChange={e => setFormData(prev => ({ 
                            ...prev, 
                            partial_refund_percentage: e.target.value ? parseFloat(e.target.value) : null 
                          }))}
                        />
                      </div>
                    )}
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* Conditions Tab */}
          <TabsContent value="conditions" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="applies_to_all_rooms">Applies to All Rooms</Label>
              <Switch
                id="applies_to_all_rooms"
                checked={formData.applies_to_all_rooms}
                onCheckedChange={checked => {
                  setFormData(prev => ({
                    ...prev,
                    applies_to_all_rooms: checked,
                    room_type_ids: checked ? [] : prev.room_type_ids,
                    room_charge_overrides: checked ? {} : prev.room_charge_overrides,
                  }));
                }}
              />
            </div>

            {!formData.applies_to_all_rooms && roomTypes.length > 0 && (
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <Label className="text-sm font-medium">Select Room Types</Label>
                <div className="space-y-3">
                  {roomTypes.map(rt => {
                    const isSelected = formData.room_type_ids.includes(rt.id);
                    const overrideAmount = formData.room_charge_overrides?.[rt.id];
                    return (
                      <div key={rt.id} className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`room-${rt.id}`}
                            checked={isSelected}
                            onCheckedChange={checked => {
                              setFormData(prev => {
                                const ids = checked
                                  ? [...prev.room_type_ids, rt.id]
                                  : prev.room_type_ids.filter(id => id !== rt.id);
                                const overrides = { ...(prev.room_charge_overrides || {}) };
                                if (!checked) delete overrides[rt.id];
                                return { ...prev, room_type_ids: ids, room_charge_overrides: overrides };
                              });
                            }}
                          />
                          <Label htmlFor={`room-${rt.id}`} className="text-sm flex-1">{rt.name}</Label>
                          {isSelected && (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-28 h-8 text-sm"
                              placeholder={`Default: ${formData.amount}`}
                              value={overrideAmount ?? ''}
                              onChange={e => {
                                setFormData(prev => {
                                  const overrides = { ...(prev.room_charge_overrides || {}) };
                                  if (e.target.value === '') {
                                    delete overrides[rt.id];
                                  } else {
                                    overrides[rt.id] = parseFloat(e.target.value) || 0;
                                  }
                                  return { ...prev, room_charge_overrides: overrides };
                                });
                              }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave amount blank to use the default. Enter a value to override for that room type.
                </p>
              </div>
            )}

            {!formData.applies_to_all_rooms && roomTypes.length === 0 && (
              <p className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-lg">
                No room types configured for this property. Add room types first.
              </p>
            )}

            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <Label className="text-sm font-medium">Night Range</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min_nights" className="text-xs text-muted-foreground">Minimum Nights</Label>
                  <Input
                    id="min_nights"
                    type="number"
                    min="0"
                    value={formData.min_nights}
                    onChange={e => setFormData(prev => ({ ...prev, min_nights: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_nights" className="text-xs text-muted-foreground">Maximum Nights (0 = no limit)</Label>
                  <Input
                    id="max_nights"
                    type="number"
                    min="0"
                    value={formData.max_nights}
                    onChange={e => setFormData(prev => ({ ...prev, max_nights: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            </div>

            {isPersonBased && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <Label className="text-sm font-medium">Applies to Guest Types</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="applies_to_adults"
                      checked={formData.applies_to_adults}
                      onCheckedChange={checked => setFormData(prev => ({ 
                        ...prev, 
                        applies_to_adults: checked as boolean 
                      }))}
                    />
                    <Label htmlFor="applies_to_adults" className="text-sm">Adults</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="applies_to_children"
                      checked={formData.applies_to_children}
                      onCheckedChange={checked => setFormData(prev => ({ 
                        ...prev, 
                        applies_to_children: checked as boolean 
                      }))}
                    />
                    <Label htmlFor="applies_to_children" className="text-sm">Children</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="applies_to_infants"
                      checked={formData.applies_to_infants}
                      onCheckedChange={checked => setFormData(prev => ({ 
                        ...prev, 
                        applies_to_infants: checked as boolean 
                      }))}
                    />
                    <Label htmlFor="applies_to_infants" className="text-sm">Infants</Label>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !formData.name || formData.amount < 0}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Save Changes' : 'Create Charge'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
