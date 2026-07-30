import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Rocket } from "lucide-react";

interface EnvironmentToggleProps {
  systemType: string;
  currentEnvironment: 'sandbox' | 'production';
  onEnvironmentChange: (newEnv: 'sandbox' | 'production') => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function EnvironmentToggle({ 
  systemType, 
  currentEnvironment, 
  onEnvironmentChange,
  disabled,
  isLoading
}: EnvironmentToggleProps) {
  const isSandbox = currentEnvironment === 'sandbox';
  const isProduction = currentEnvironment === 'production';
  
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-primary/5 border-primary/20">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Active Environment</Label>
          {isSandbox ? (
            <Badge variant="outline" className="text-xs gap-1 bg-amber-500/10 text-warning border-amber-500/30">
              <FlaskConical className="h-3 w-3" />
              Testing
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs gap-1 bg-green-500/10 text-success border-green-500/30">
              <Rocket className="h-3 w-3" />
              Live
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          API calls will use the {currentEnvironment} endpoint
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm transition-colors ${isSandbox ? 'font-semibold text-warning' : 'text-muted-foreground'}`}>
          Sandbox
        </span>
        <Switch
          checked={isProduction}
          onCheckedChange={(checked) => onEnvironmentChange(checked ? 'production' : 'sandbox')}
          disabled={disabled || isLoading}
          className="data-[state=checked]:bg-green-600"
        />
        <span className={`text-sm transition-colors ${isProduction ? 'font-semibold text-success' : 'text-muted-foreground'}`}>
          Production
        </span>
      </div>
    </div>
  );
}
