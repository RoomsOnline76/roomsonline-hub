
import { Plus, Minus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AddOn {
  id?: string;
  name: string;
  description?: string;
  price?: number;
  priceType?: string; // "per_night", "per_stay", "per_person", "per_person_per_night"
  category?: string;
  maxQuantity?: number;
  image?: string | { url: string };
}

export interface SelectedAddOn {
  addon: AddOn;
  quantity: number;
  total: number;
}

interface AddOnSelectorProps {
  addons: AddOn[];
  nights: number;
  guests: number;
  selectedAddons: SelectedAddOn[];
  onSelectionChange: (selected: SelectedAddOn[]) => void;
  className?: string;
}

function computeTotal(addon: AddOn, qty: number, nights: number, guests: number): number {
  const price = addon.price || 0;
  switch (addon.priceType) {
    case "per_night":
      return price * nights * qty;
    case "per_person":
      return price * guests * qty;
    case "per_person_per_night":
      return price * guests * nights * qty;
    default: // per_stay / flat
      return price * qty;
  }
}

function formatPriceLabel(addon: AddOn): string {
  const price = addon.price || 0;
  const formatted = `R${price.toLocaleString()}`;
  switch (addon.priceType) {
    case "per_night":
      return `${formatted} / night`;
    case "per_person":
      return `${formatted} / person`;
    case "per_person_per_night":
      return `${formatted} / person / night`;
    default:
      return formatted;
  }
}

export function AddOnSelector({
  addons,
  nights,
  guests,
  selectedAddons,
  onSelectionChange,
  className,
}: AddOnSelectorProps) {
  if (!addons || addons.length === 0) return null;

  const getQty = (addon: AddOn) => {
    const found = selectedAddons.find((s) => (s.addon.id || s.addon.name) === (addon.id || addon.name));
    return found?.quantity || 0;
  };

  const updateQty = (addon: AddOn, qty: number) => {
    const key = addon.id || addon.name;
    if (qty <= 0) {
      onSelectionChange(selectedAddons.filter((s) => (s.addon.id || s.addon.name) !== key));
    } else {
      const total = computeTotal(addon, qty, nights, guests);
      const existing = selectedAddons.find((s) => (s.addon.id || s.addon.name) === key);
      if (existing) {
        onSelectionChange(
          selectedAddons.map((s) =>
            (s.addon.id || s.addon.name) === key ? { ...s, quantity: qty, total } : s
          )
        );
      } else {
        onSelectionChange([...selectedAddons, { addon, quantity: qty, total }]);
      }
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-medium">Extras & Add-ons</h4>
      </div>
      <div className="space-y-2">
        {addons.map((addon, i) => {
          const qty = getQty(addon);
          const maxQty = addon.maxQuantity || 10;
          const imgUrl = typeof addon.image === "string" ? addon.image : addon.image?.url;

          return (
            <div
              key={addon.id || i}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                qty > 0 ? "border-primary/30 bg-primary/5" : "border-border/50 bg-card"
              )}
            >
              {imgUrl && (
                <img src={imgUrl} alt={addon.name} className="h-12 w-12 rounded-md object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{addon.name}</p>
                {addon.description && (
                  <p className="text-xs text-muted-foreground line-clamp-1">{addon.description}</p>
                )}
                <p className="text-xs font-medium text-primary mt-0.5">{formatPriceLabel(addon)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {qty > 0 ? (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => updateQty(addon, qty - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-5 text-center text-sm font-medium tabular-nums">{qty}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      disabled={qty >= maxQty}
                      onClick={() => updateQty(addon, qty + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => updateQty(addon, 1)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {selectedAddons.length > 0 && (
        <div className="text-xs text-muted-foreground text-right">
          Add-ons total: <span className="font-medium text-foreground">R{selectedAddons.reduce((s, a) => s + a.total, 0).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
