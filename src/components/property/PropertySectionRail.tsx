import React, { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { RailGroup } from "@/config/propertySectionOrder";

interface PropertySectionRailProps {
  groups: RailGroup[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Section keys that currently have activation blockers */
  blockerKeys?: Set<string>;
  className?: string;
}

/**
 * Shared grouped left-rail navigation for property editing surfaces.
 * Used by ROLOS Property Setup and the Admin PropertyForm so both share one IA + look.
 */
export const PropertySectionRail: React.FC<PropertySectionRailProps> = ({
  groups,
  activeKey,
  onSelect,
  blockerKeys,
  className,
}) => {
  const handleSelect = useCallback((key: string) => onSelect(key), [onSelect]);

  return (
    <nav className={cn("space-y-4", className)}>
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            {group.sections.map((s) => {
              const Icon = s.icon;
              const active = activeKey === s.key;
              const hasBlocker = blockerKeys?.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => handleSelect(s.key)}
                  className={cn(
                    "relative min-w-[150px] shrink-0 rounded-md border px-3 py-2 text-left text-xs transition-colors lg:w-full lg:min-w-0",
                    active
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted",
                    hasBlocker && "ring-2 ring-destructive/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                    />
                    <span className="font-medium">{s.label}</span>
                  </div>
                  <p className="mt-1 hidden text-[10px] leading-tight opacity-80 lg:block">{s.description}</p>
                  {active && s.hints && (
                    <ul className="mt-2 hidden flex-wrap gap-1 lg:flex">
                      {s.hints.map((h) => {
                        const HIcon = h.icon;
                        return (
                          <li
                            key={h.key}
                            className="flex items-center gap-1 rounded border border-border/50 bg-background/60 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                          >
                            <HIcon className="h-2.5 w-2.5" />
                            {h.label}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {hasBlocker && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
};
