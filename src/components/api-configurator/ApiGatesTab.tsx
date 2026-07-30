import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLOS_API_ACTION_GROUPS } from "@/config/rolosApiActions";

const ACTION_GROUPS: Record<string, string[]> = ROLOS_API_ACTION_GROUPS;


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
