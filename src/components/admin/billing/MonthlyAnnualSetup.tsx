import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface MonthlyAnnualSetupValue {
  enabled: boolean;
  recurring: string; // monthly OR annual amount
  billingMode: "monthly" | "annual";
  setup: string;
}

interface Props {
  title: string;
  description?: string;
  value: MonthlyAnnualSetupValue;
  onChange: (v: MonthlyAnnualSetupValue) => void;
  suggestedRecurring?: number | null;
  suggestedSetup?: number | null;
  /** Hides the enable switch — for global defaults where the row is always editable. */
  alwaysOpen?: boolean;
  /** Extra label shown under the title (e.g. "Applied per activated property regardless of portfolio size."). */
  policyNote?: string;
}

export function MonthlyAnnualSetup({
  title,
  description,
  value,
  onChange,
  suggestedRecurring,
  suggestedSetup,
  alwaysOpen,
  policyNote,
}: Props) {
  const open = alwaysOpen || value.enabled;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label className="text-sm font-medium">{title}</Label>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
          {policyNote && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 italic">{policyNote}</p>
          )}
        </div>
        {!alwaysOpen && (
          <Switch
            checked={value.enabled}
            onCheckedChange={(on) =>
              onChange({
                ...value,
                enabled: on,
                recurring: on && !value.recurring && suggestedRecurring != null ? String(suggestedRecurring) : value.recurring,
                setup: on && !value.setup && suggestedSetup != null ? String(suggestedSetup) : value.setup,
              })
            }
          />
        )}
      </div>
      {open && (
        <div className="grid grid-cols-[1fr_120px_1fr] gap-2 pt-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Recurring fee (ZAR)</Label>
            <Input
              type="number"
              step="50"
              min="0"
              value={value.recurring}
              onChange={(e) => onChange({ ...value, recurring: e.target.value })}
              placeholder={suggestedRecurring != null ? String(suggestedRecurring) : "0"}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Billed</Label>
            <Select value={value.billingMode} onValueChange={(v) => onChange({ ...value, billingMode: v as "monthly" | "annual" })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annually</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">One-off setup (ZAR)</Label>
            <Input
              type="number"
              step="50"
              min="0"
              value={value.setup}
              onChange={(e) => onChange({ ...value, setup: e.target.value })}
              placeholder={suggestedSetup != null ? String(suggestedSetup) : "0"}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
