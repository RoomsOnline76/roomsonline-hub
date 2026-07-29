import { useLocation, useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasMinRole } from "@/lib/permissions";
import { mobileNavItems, adminMobileNavItem, systemMobileNavItem, type NavItem } from "@/config/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useState } from "react";
import { navigationConfig } from "@/config/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAdminActionCounts } from "@/hooks/useAdminActionCounts";

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const { userRole } = useAuth();

  const isAdmin = hasMinRole(userRole, 'admin');
  const isDev = hasMinRole(userRole, 'dev');
  const { counts: actionCounts, totalPending } = useAdminActionCounts({ isAdmin, isDev });

  const isActive = (href: string) => location.pathname === href;


  // Build visible nav items based on role - admin/dev get Admin first
  const visibleItems: NavItem[] = [];
  
  if (hasMinRole(userRole, 'admin')) {
    visibleItems.push(adminMobileNavItem);
  }
  
  visibleItems.push(...mobileNavItems);
  
  // Add system item if user has dev role
  if (hasMinRole(userRole, 'dev')) {
    visibleItems.push(systemMobileNavItem);
  }

  // Show max 4 items + more button if needed
  const maxVisible = 4;
  const displayItems = visibleItems.slice(0, maxVisible);
  const hasMore = visibleItems.length > maxVisible;

  const NavButton = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    // "Admin" rolls up every pending queue; other items use their own count.
    const pending = item.id === adminMobileNavItem.id ? totalPending : (actionCounts[item.id] || 0);

    return (
      <button
        onClick={() => navigate(item.href)}
        aria-label={pending > 0 ? `${item.title} (${pending} need attention)` : item.title}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 min-h-[56px] transition-colors relative",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <span className="relative">
          <Icon className={cn("h-5 w-5", active && "text-primary")} />
          {pending > 0 && (
            <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
          )}
        </span>
        <span className="text-[10px] font-medium">{item.title}</span>
      </button>
    );
  };


  // Get all accessible sections for the More sheet
  const accessibleSections = navigationConfig.filter(section => 
    hasMinRole(userRole, section.minRole)
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div className="flex items-center justify-around px-2 safe-area-inset-bottom">
        {displayItems.map((item) => (
          <NavButton key={item.id} item={item} />
        ))}
        
        {hasMore && (
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 min-h-[56px] transition-colors",
                  "text-muted-foreground hover:text-foreground"
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[60vh] flex flex-col">
              <SheetHeader className="shrink-0">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-6 overflow-y-auto flex-1 min-h-0 pb-6">
                {accessibleSections.map((section) => {
                  const accessibleItems = section.items.filter(item => 
                    hasMinRole(userRole, item.minRole)
                  );
                  
                  if (accessibleItems.length === 0) return null;
                  
                  return (
                    <div key={section.id}>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        {section.label}
                      </h3>
                      <div className="grid grid-cols-4 gap-2">
                        {accessibleItems.map((item) => {
                          const Icon = item.icon;
                          const active = isActive(item.href);
                          const pending = actionCounts[item.id] || 0;

                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                navigate(item.href);
                                setMoreOpen(false);
                              }}
                              className={cn(
                                "flex flex-col items-center justify-center gap-1 p-3 rounded-lg transition-colors",
                                active 
                                  ? "bg-primary/10 text-primary" 
                                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <span className="relative">
                                <Icon className="h-5 w-5" />
                                {pending > 0 && (
                                  <span className="absolute -right-2 -top-1.5 min-w-[16px] rounded-full bg-primary px-1 text-[9px] font-semibold leading-4 text-primary-foreground">
                                    {pending}
                                  </span>
                                )}
                              </span>
                              <span className="text-[10px] font-medium text-center leading-tight">
                                {item.title}
                              </span>

                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
}
