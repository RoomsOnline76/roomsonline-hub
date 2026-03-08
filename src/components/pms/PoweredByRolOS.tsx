import { cn } from "@/lib/utils";

interface PoweredByRolOSProps {
  className?: string;
}

export function PoweredByRolOS({ className }: PoweredByRolOSProps) {
  return (
    <p className={cn("text-[10px] text-muted-foreground/60 text-center select-none", className)}>
      Powered by <span className="font-medium">ROL'OS</span>
    </p>
  );
}
