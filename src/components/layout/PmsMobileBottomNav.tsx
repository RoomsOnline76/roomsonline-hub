import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MoreHorizontal, Users, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { hasMinRole } from "@/lib/permissions";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { usePmsStaffRole } from "@/hooks/usePmsStaffRole";
import { VersionBadge } from "./VersionBadge";
import { getVisibleModules } from "@/lib/pmsPermissions";
import {
  pmsNavGroups,
  isNavItemVisibleForScope,
  isNavItemVisibleForAddons,
  type NavItem,
} from "./PMSSidebar";
import { useHubspotCapability } from "@/hooks/useHubspotCrm";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * ROL'OS mobile bottom navigation.
 *
 * Inside the ROL'OS shell the bottom bar carries the ROL'OS modules (never the admin
 * menu). Everything admin collapses into a single "Admin" entry so a platform user can
 * still jump back out, while the More sheet exposes the full ROL'OS module list.
 */
export function PmsMobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const { userRole, signOut } = useAuth();
  const { propertyId } = usePmsPropertyId();
  const { staffRole } = usePmsStaffRole(propertyId);

  const visibleModules = getVisibleModules(staffRole);
  const isPlatformUser = hasMinRole(userRole, "admin");
  const { available: hubspotAvailable } = useHubspotCapability();

  const groups = pmsNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (item.platformOnly ? isPlatformUser : true) &&
          (isPlatformUser || visibleModules.includes(item.module)) &&
          isNavItemVisibleForScope(item, !!propertyId) &&
          isNavItemVisibleForAddons(item, hubspotAvailable),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const allItems = groups.flatMap((group) => group.items);
  // Primary tabs: the four most-used ROL'OS modules the user can actually see.
  const preferred = ["/pms", "/pms/rooms", "/pms/guests", "/pms/channels"];
  const primary = preferred
    .map((href) => allItems.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item))
    .slice(0, 4);
  const displayItems = primary.length > 0 ? primary : allItems.slice(0, 4);

  const isActive = (href: string) => location.pathname === href;

  const go = (href: string) => {
    const params = propertyId ? `?property=${propertyId}` : "";
    navigate(`${href}${params}`);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div className="flex items-center justify-around px-2 safe-area-inset-bottom">
        {displayItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <button
              key={item.href}
              onClick={() => go(item.href)}
              aria-label={item.title}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 min-h-[56px] transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.title}</span>
            </button>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="More ROL'OS modules"
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 min-h-[56px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="flex h-[70vh] flex-col">
            <SheetHeader className="shrink-0">
              <SheetTitle>ROL'OS</SheetTitle>
            </SheetHeader>
            <div className="mt-4 min-h-0 flex-1 space-y-6 overflow-y-auto pb-6">
              {groups.map((group) => (
                <div key={group.label}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <button
                          key={item.href}
                          onClick={() => {
                            go(item.href);
                            setMoreOpen(false);
                          }}
                          className={cn(
                            "flex flex-col items-center justify-center gap-1 rounded-lg p-3 transition-colors",
                            active
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-center text-[10px] font-medium leading-tight">
                            {item.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Everything admin collapses into a single entry. */}
              {isPlatformUser && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Admin
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => {
                        navigate("/admin/dashboard");
                        setMoreOpen(false);
                      }}
                      className="flex flex-col items-center justify-center gap-1 rounded-lg p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Users className="h-5 w-5" />
                      <span className="text-center text-[10px] font-medium leading-tight">
                        Admin
                      </span>
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={async () => {
                  setMoreOpen(false);
                  await signOut();
                  navigate("/auth");
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left text-sm font-semibold text-destructive transition-colors hover:bg-muted"
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </button>

              <VersionBadge />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
