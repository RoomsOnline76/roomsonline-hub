import { useLocation, useNavigate } from "react-router-dom";
import { Menu, ChevronRight, LogOut } from "lucide-react";
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
import { PmsMobileBottomNav } from "./PmsMobileBottomNav";
import { useNavVisibility } from "@/hooks/useNavVisibility";

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { userRole, signOut } = useAuth();
  const { canAccessItem, canAccessSection } = useNavVisibility();

  const isAdmin = hasMinRole(userRole, 'admin');
  const isDev = hasMinRole(userRole, 'dev');
  const { counts: actionCounts, totalPending } = useAdminActionCounts({ isAdmin, isDev });

  const isActive = (href: string) => location.pathname === href;

  // Inside the ROL'OS shell the bottom bar carries the ROL'OS modules instead.
  const inPms = location.pathname === "/pms" || location.pathname.startsWith("/pms/");

  // Two quick shortcuts stay on the bar; everything else lives in the hamburger.
  const quickItems: NavItem[] = [];
  if (isAdmin) quickItems.push(adminMobileNavItem);
  quickItems.push(mobileNavItems[0], mobileNavItems[1]);

  // Same section visibility rules as the desktop sidebar.
  const accessibleSections = navigationConfig.filter(canAccessSection);


  const go = (href: string) => {
    navigate(href);
    setMenuOpen(false);
  };

  const NavButton = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href);
    const Icon = item.icon;
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

  if (inPms) return <PmsMobileBottomNav />;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div className="flex items-center justify-around px-2 safe-area-inset-bottom">
        {quickItems.map((item) => (
          <NavButton key={item.id} item={item} />
        ))}

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Open navigation menu"
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 min-h-[56px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Menu className="h-5 w-5" />
              <span className="text-[10px] font-medium">Menu</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="flex h-[85vh] flex-col">
            <SheetHeader className="shrink-0">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <div className="mt-4 min-h-0 flex-1 space-y-6 overflow-y-auto pb-8">
              {accessibleSections.map((section) => {
                const accessibleItems = section.items.filter((item) =>
                  hasMinRole(userRole, item.minRole)
                );
                const SectionIcon = section.icon;

                // Link-only section (e.g. ROL'OS PMS) — render as a single row.
                if (accessibleItems.length === 0) {
                  if (!section.href) return null;
                  return (
                    <button
                      key={section.id}
                      onClick={() => go(section.href!)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted"
                    >
                      {SectionIcon && <SectionIcon className="h-5 w-5 text-primary" />}
                      <span className="flex-1 text-sm font-semibold">{section.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  );
                }

                return (
                  <div key={section.id}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                            onClick={() => go(item.href)}
                            className={cn(
                              "flex flex-col items-center justify-center gap-1 rounded-lg p-3 transition-colors",
                              active
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
                            <span className="text-center text-[10px] font-medium leading-tight">
                              {item.title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {isDev && (
                <button
                  onClick={() => go(systemMobileNavItem.href)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted"
                >
                  <systemMobileNavItem.icon className="h-5 w-5 text-primary" />
                  <span className="flex-1 text-sm font-semibold">System overview</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              )}

              <button
                onClick={async () => {
                  setMenuOpen(false);
                  await signOut();
                  navigate("/auth");
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left text-sm font-semibold text-destructive transition-colors hover:bg-muted"
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
