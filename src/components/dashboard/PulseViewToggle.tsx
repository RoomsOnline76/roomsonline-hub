import { useAuth } from "@/hooks/useAuth";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Building2, TrendingUp } from "lucide-react";

interface PulseViewToggleProps {
  view: "property" | "rol";
  onViewChange: (view: "property" | "rol") => void;
}

export function PulseViewToggle({ view, onViewChange }: PulseViewToggleProps) {
  const { isAdmin, isDev } = useAuth();

  // Only show toggle to admin/dev users
  if (!isAdmin && !isDev) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground hidden sm:inline">View:</span>
      <ToggleGroup 
        type="single" 
        value={view} 
        onValueChange={(value) => value && onViewChange(value as "property" | "rol")}
        className="bg-muted/50 p-0.5 rounded-lg"
      >
        <ToggleGroupItem 
          value="property" 
          aria-label="Property Pulse"
          className="gap-1.5 px-3 py-1.5 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm"
        >
          <Building2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Property</span>
        </ToggleGroupItem>
        <ToggleGroupItem 
          value="rol" 
          aria-label="ROL Revenue Pulse"
          className="gap-1.5 px-3 py-1.5 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm"
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">ROL Revenue</span>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
