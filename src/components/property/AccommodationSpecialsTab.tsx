import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Tag, Package, Percent, DollarSign, Gift } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface RoomTypeOption {
  id: string;
  name: string;
}

interface Special {
  id: string;
  property_id: string;
  category: string;
  name: string;
  description: string | null;
  special_type: string;
  discount_percent: number | null;
  fixed_amount: number | null;
  fixed_price: number | null;
  currency: string | null;
  valid_from: string | null;
  valid_to: string | null;
  book_from: string | null;
  book_until: string | null;
  min_stay: number | null;
  max_stay: number | null;
  applicable_room_ids: string[] | null;
  included_items: any;
  terms: string | null;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  age_restricted: boolean;
  min_age: number | null;
  max_age: number | null;
  age_label: string | null;
}

interface Props {
  propertyId: string;
  category?: string;
  roomTypes?: RoomTypeOption[];
}

const SPECIAL_TYPES = [
  { value: "discount", label: "Discount %", icon: Percent },
  { value: "fixed_off", label: "Fixed Off", icon: DollarSign },
  { value: "fixed_price", label: "Fixed Price", icon: Tag },
  { value: "package", label: "Package", icon: Package },
];

const emptySpecial = (propertyId: string, category: string): Omit<Special, "id"> => ({
  property_id: propertyId,
  category,
  name: "",
  description: null,
  special_type: "discount",
  discount_percent: null,
  fixed_amount: null,
  fixed_price: null,
  currency: "ZAR",
  valid_from: null,
  valid_to: null,
  book_from: null,
  book_until: null,
  min_stay: null,
  max_stay: null,
  applicable_room_ids: null,
  included_items: null,
  terms: null,
  is_active: true,
  is_public: true,
  sort_order: 0,
  age_restricted: false,
  min_age: null,
  max_age: null,
  age_label: null,
});

export function AccommodationSpecialsTab({ propertyId, category = "accommodation", roomTypes = [] }: Props) {
  const [specials, setSpecials] = useState<Special[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<Special> & { name: string }>({ name: "" });
  const [packageItem, setPackageItem] = useState("");

  const fetchSpecials = useCallback(async () => {
    const { data, error } = await supabase
      .from("property_specials" as any)
      .select("*")
      .eq("property_id", propertyId)
      .eq("category", category)
      .order("sort_order");
    if (!error && data) {
      setSpecials(data as unknown as Special[]);
    }
    setLoading(false);
  }, [propertyId, category]);

  useEffect(() => {
    fetchSpecials();
  }, [fetchSpecials]);

  const selected = specials.find((s) => s.id === selectedId);

  useEffect(() => {
    if (selected) {
      setDraft({ ...selected });
    }
  }, [selectedId]);

  const addNew = async () => {
    const newSpecial = emptySpecial(propertyId, category);
    const name = `New Special ${specials.length + 1}`;
    const { data, error } = await supabase
      .from("property_specials" as any)
      .insert({ ...newSpecial, name } as any)
      .select()
      .single();
    if (error) {
      toast.error("Failed to create special: " + error.message);
      return;
    }
    await fetchSpecials();
    setSelectedId((data as any).id);
  };

  const save = async () => {
    if (!selectedId || !draft.name) return;
    setSaving(true);
    const { data: updated, error } = await supabase
      .from("property_specials" as any)
      .update({
        name: draft.name,
        description: draft.description || null,
        special_type: draft.special_type || "discount",
        discount_percent: draft.discount_percent ?? null,
        fixed_amount: draft.fixed_amount ?? null,
        fixed_price: draft.fixed_price ?? null,
        currency: draft.currency || "ZAR",
        valid_from: draft.valid_from || null,
        valid_to: draft.valid_to || null,
        book_from: draft.book_from || null,
        book_until: draft.book_until || null,
        min_stay: draft.min_stay ?? null,
        max_stay: draft.max_stay ?? null,
        applicable_room_ids: draft.applicable_room_ids || null,
        included_items: draft.included_items || null,
        terms: draft.terms || null,
        is_active: draft.is_active ?? true,
        is_public: draft.is_public ?? true,
        age_restricted: draft.age_restricted ?? false,
        min_age: draft.age_restricted ? (draft.min_age ?? null) : null,
        max_age: draft.age_restricted ? (draft.max_age ?? null) : null,
        age_label: draft.age_restricted ? (draft.age_label || null) : null,
      } as any)
      .eq("id", selectedId)
      .select();
    setSaving(false);
    if (error) {
      toast.error("Failed to save: " + error.message);
      return;
    }
    if (!updated || (updated as any[]).length === 0) {
      toast.error("Save failed — no rows updated (permission issue?)");
      return;
    }
    toast.success("Special saved");
    await fetchSpecials();
  };

  const deleteSpecial = async (id: string) => {
    await supabase.from("property_specials" as any).delete().eq("id", id);
    if (selectedId === id) setSelectedId(null);
    await fetchSpecials();
    toast.success("Deleted");
  };

  const addPackageItem = () => {
    if (!packageItem.trim()) return;
    const items = Array.isArray(draft.included_items) ? [...draft.included_items] : [];
    items.push(packageItem.trim());
    setDraft({ ...draft, included_items: items });
    setPackageItem("");
  };

  const removePackageItem = (idx: number) => {
    const items = Array.isArray(draft.included_items) ? [...draft.included_items] : [];
    items.splice(idx, 1);
    setDraft({ ...draft, included_items: items });
  };

  const toggleRoom = (roomId: string) => {
    const current = draft.applicable_room_ids || [];
    const next = current.includes(roomId) ? current.filter((r) => r !== roomId) : [...current, roomId];
    setDraft({ ...draft, applicable_room_ids: next.length ? next : null });
  };

  const typeIcon = (type: string) => {
    const t = SPECIAL_TYPES.find((s) => s.value === type);
    return t ? <t.icon className="h-3 w-3" /> : <Gift className="h-3 w-3" />;
  };

  if (loading) return <div className="text-xs text-muted-foreground py-4 text-center">Loading specials...</div>;

  return (
    <div className="flex gap-3 min-h-[300px]">
      {/* Sidebar */}
      <div className="w-48 space-y-1 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-xs text-muted-foreground uppercase">
            {category === "event_wedding" ? "Event Specials" : "Specials"}
          </h3>
          <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={addNew}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        {specials.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No specials yet</p>
        )}
        {specials.map((s) => (
          <div
            key={s.id}
            className={`flex items-center justify-between py-1.5 px-2 rounded transition-colors text-xs cursor-pointer ${
              selectedId === s.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
            }`}
            onClick={() => setSelectedId(s.id)}
          >
            <span className="flex items-center gap-1 truncate flex-1">
              {typeIcon(s.special_type)}
              {s.name}
              {!s.is_active && <Badge variant="outline" className="text-[9px] h-3 ml-1">off</Badge>}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-4 w-4 p-0 shrink-0"
              onClick={(e) => { e.stopPropagation(); deleteSpecial(s.id); }}
            >
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* Editor */}
      <div className="flex-1 border rounded-md p-3">
        {!selectedId ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            Select a special or create a new one
          </div>
        ) : (
          <div className="space-y-3">
            {/* Row 1: Name, type, active/public */}
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Name*</Label>
                <Input
                  value={draft.name || ""}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="w-32 space-y-1">
                <Label className="text-xs">Type</Label>
                <Select
                  value={draft.special_type || "discount"}
                  onValueChange={(v) => setDraft({ ...draft, special_type: v })}
                >
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPECIAL_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-0.5">
                <Switch
                  checked={draft.is_active ?? true}
                  onCheckedChange={(c) => setDraft({ ...draft, is_active: c })}
                  className="scale-75"
                />
                <Label className="text-[10px]">Active</Label>
                <Switch
                  checked={draft.is_public ?? true}
                  onCheckedChange={(c) => setDraft({ ...draft, is_public: c })}
                  className="scale-75"
                />
                <Label className="text-[10px]">Public</Label>
              </div>
            </div>

            {/* Age Restriction */}
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex items-center gap-2 pb-0.5">
                <Switch
                  checked={draft.age_restricted ?? false}
                  onCheckedChange={(c) => setDraft({ ...draft, age_restricted: c })}
                  className="scale-75"
                />
                <Label className="text-[10px]">Age Restricted</Label>
              </div>
              {draft.age_restricted && (
                <>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={draft.age_label || ""}
                      onChange={(e) => setDraft({ ...draft, age_label: e.target.value })}
                      placeholder="e.g. Pensioner"
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="w-20 space-y-1">
                    <Label className="text-xs">Min Age</Label>
                    <Input
                      type="number"
                      value={draft.min_age ?? ""}
                      onChange={(e) => setDraft({ ...draft, min_age: e.target.value ? Number(e.target.value) : null })}
                      className="h-7 text-xs"
                      min={0} max={120}
                    />
                  </div>
                  <div className="w-20 space-y-1">
                    <Label className="text-xs">Max Age</Label>
                    <Input
                      type="number"
                      value={draft.max_age ?? ""}
                      onChange={(e) => setDraft({ ...draft, max_age: e.target.value ? Number(e.target.value) : null })}
                      className="h-7 text-xs"
                      min={0} max={120}
                    />
                  </div>
                </>
              )}
            </div>


            <div className="grid grid-cols-4 gap-2">
              {(draft.special_type === "discount") && (
                <div className="space-y-1">
                  <Label className="text-xs">Discount %</Label>
                  <Input
                    type="number"
                    value={draft.discount_percent ?? ""}
                    onChange={(e) => setDraft({ ...draft, discount_percent: e.target.value ? Number(e.target.value) : null })}
                    className="h-7 text-xs"
                    min={0} max={100}
                  />
                </div>
              )}
              {(draft.special_type === "fixed_off") && (
                <div className="space-y-1">
                  <Label className="text-xs">Amount Off ({draft.currency || "ZAR"})</Label>
                  <Input
                    type="number"
                    value={draft.fixed_amount ?? ""}
                    onChange={(e) => setDraft({ ...draft, fixed_amount: e.target.value ? Number(e.target.value) : null })}
                    className="h-7 text-xs"
                    min={0}
                  />
                </div>
              )}
              {(draft.special_type === "fixed_price") && (
                <div className="space-y-1">
                  <Label className="text-xs">Price ({draft.currency || "ZAR"})</Label>
                  <Input
                    type="number"
                    value={draft.fixed_price ?? ""}
                    onChange={(e) => setDraft({ ...draft, fixed_price: e.target.value ? Number(e.target.value) : null })}
                    className="h-7 text-xs"
                    min={0}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Stay From</Label>
                <Input
                  type="date"
                  value={draft.valid_from || ""}
                  onChange={(e) => setDraft({ ...draft, valid_from: e.target.value || null })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stay Until</Label>
                <Input
                  type="date"
                  value={draft.valid_to || ""}
                  onChange={(e) => setDraft({ ...draft, valid_to: e.target.value || null })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Book From</Label>
                <Input
                  type="date"
                  value={draft.book_from || ""}
                  onChange={(e) => setDraft({ ...draft, book_from: e.target.value || null })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Book By</Label>
                <Input
                  type="date"
                  value={draft.book_until || ""}
                  onChange={(e) => setDraft({ ...draft, book_until: e.target.value || null })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Min Stay</Label>
                <Input
                  type="number"
                  value={draft.min_stay ?? ""}
                  onChange={(e) => setDraft({ ...draft, min_stay: e.target.value ? Number(e.target.value) : null })}
                  className="h-7 text-xs"
                  min={1}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Stay</Label>
                <Input
                  type="number"
                  value={draft.max_stay ?? ""}
                  onChange={(e) => setDraft({ ...draft, max_stay: e.target.value ? Number(e.target.value) : null })}
                  className="h-7 text-xs"
                  min={1}
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={draft.description || ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="text-xs min-h-[50px]"
                rows={2}
              />
            </div>

            {/* Package inclusions */}
            {draft.special_type === "package" && (
              <div className="space-y-1">
                <Label className="text-xs">Package Inclusions</Label>
                <div className="flex gap-1">
                  <Input
                    value={packageItem}
                    onChange={(e) => setPackageItem(e.target.value)}
                    placeholder="e.g. Breakfast included"
                    className="h-7 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPackageItem())}
                  />
                  <Button size="sm" className="h-7 text-xs" onClick={addPackageItem}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(Array.isArray(draft.included_items) ? draft.included_items : []).map((item: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-[10px] gap-0.5">
                      {item}
                      <button onClick={() => removePackageItem(i)} className="ml-0.5 hover:text-destructive">×</button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Applicable rooms */}
            {roomTypes.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Applicable Rooms <span className="text-muted-foreground">(none = all)</span></Label>
                <div className="flex flex-wrap gap-2">
                  {roomTypes.map((rt) => (
                    <label key={rt.id} className="flex items-center gap-1 text-xs cursor-pointer">
                      <Checkbox
                        checked={(draft.applicable_room_ids || []).includes(rt.id)}
                        onCheckedChange={() => toggleRoom(rt.id)}
                        className="h-3 w-3"
                      />
                      {rt.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Terms */}
            <div className="space-y-1">
              <Label className="text-xs">Terms & Conditions</Label>
              <Textarea
                value={draft.terms || ""}
                onChange={(e) => setDraft({ ...draft, terms: e.target.value })}
                className="text-xs min-h-[40px]"
                rows={2}
              />
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving || !draft.name}>
                {saving ? "Saving..." : "Save Special"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
