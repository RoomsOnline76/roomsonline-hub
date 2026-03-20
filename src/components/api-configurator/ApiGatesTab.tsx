import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACTION_GROUPS: Record<string, string[]> = {
  "Availability & Rates": ["fetch_availability", "get_room_types", "get_rate_types", "set_availability", "set_rates", "get_rate_plans", "get_rate_seasons"],
  "Reservations": ["get_reservations", "create_reservation", "modify_reservation", "cancel_reservation"],
  "Rooms": ["get_physical_rooms", "create_physical_room", "update_room_status", "get_rolos_room_types", "create_rolos_room_type", "update_rolos_room_type"],
  "Guest CRM": ["get_guest_profiles", "get_guest_profile", "create_guest_profile", "update_guest_profile"],
  "Operations": ["check_in", "check_out", "get_housekeeping_board", "assign_housekeeping_task", "complete_housekeeping_task", "get_daily_metrics"],
  "Folios & Charges": ["get_folio", "add_folio_charge", "process_folio_payment", "apply_service_charges", "process_checkout_refunds", "get_booking_charges"],
  "Inventory": ["update_inventory", "check_inventory", "backfill_inventory"],
  "System": ["get_capabilities", "health_check", "get_ui_config"],
};

interface ApiGatesConfig {
  disabled_actions: string[];
}

const DEFAULT: ApiGatesConfig = { disabled_actions: [] };

interface Props {
  config: ApiGatesConfig;
  onChange: (config: ApiGatesConfig) => void;
}

export function ApiGatesTab({ config, onChange }: Props) {
  const c = { ...DEFAULT, ...config };

  const toggle = (action: string) => {
    const disabled = c.disabled_actions.includes(action)
      ? c.disabled_actions.filter((a) => a !== action)
      : [...c.disabled_actions, action];
    onChange({ disabled_actions: disabled });
  };

  return (
    <div className="space-y-4">
      {Object.entries(ACTION_GROUPS).map(([group, actions]) => (
        <Card key={group}>
          <CardHeader className="pb-3"><CardTitle className="text-base">{group}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {actions.map((action) => (
                <div key={action} className="flex items-center gap-2">
                  <Switch checked={!c.disabled_actions.includes(action)} onCheckedChange={() => toggle(action)} />
                  <Label className="text-xs font-mono">{action}</Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export type { ApiGatesConfig };
export { DEFAULT as API_GATES_DEFAULTS };
