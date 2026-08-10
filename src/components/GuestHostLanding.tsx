import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  guestHostPath,
  resolveGuestHostTarget,
  resolveGuestHostTargetSync,
  type GuestHostTarget,
} from "@/lib/guestDomain";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Landing for public guest booking hosts (white-label / book.* domains).
 * Sends visitors to the host's booking surface — never to /auth.
 */
export function GuestHostLanding() {
  const [target, setTarget] = useState<GuestHostTarget>(() => resolveGuestHostTargetSync());
  const [resolved, setResolved] = useState<boolean>(() => resolveGuestHostTargetSync() !== null);

  useEffect(() => {
    if (resolved) return;
    let active = true;
    resolveGuestHostTarget().then((t) => {
      if (!active) return;
      setTarget(t);
      setResolved(true);
    });
    return () => {
      active = false;
    };
  }, [resolved]);

  const path = guestHostPath(target);
  if (path) return <Navigate to={path} replace />;

  if (!resolved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-4 px-6">
          <Skeleton className="h-8 w-2/3 mx-auto" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Booking site</h1>
        <p className="text-muted-foreground">
          This booking page is being set up. Please use the booking link supplied by the
          property to continue.
        </p>
      </div>
    </main>
  );
}
