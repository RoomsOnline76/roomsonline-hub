import { cn } from "@/lib/utils";
import { UserRole, getRoleDisplayName, getRoleBadgeStyle } from "@/lib/permissions";

interface RoleIndicatorProps {
  role: UserRole;
  className?: string;
  showLabel?: boolean;
}

export function RoleIndicator({ role, className, showLabel = true }: RoleIndicatorProps) {
  const style = getRoleBadgeStyle(role);
  const displayName = getRoleDisplayName(role);
  
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border",
        style.bg,
        style.text,
        style.border,
        className
      )}
    >
      <span className={cn(
        "w-1.5 h-1.5 rounded-full",
        role === 'dev' && "bg-destructive animate-pulse",
        role === 'admin' && "bg-accent",
        role === 'owner' && "bg-muted-foreground"
      )} />
      {showLabel && <span>{displayName} Mode</span>}
    </div>
  );
}
