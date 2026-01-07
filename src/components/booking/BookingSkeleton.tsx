import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface BookingSkeletonProps {
  variant?: "property" | "room" | "checkout";
  className?: string;
}

export function BookingSkeleton({ variant = "property", className }: BookingSkeletonProps) {
  if (variant === "property") {
    return (
      <div className={cn("animate-in fade-in duration-500", className)}>
        {/* Hero skeleton */}
        <div className="h-[50vh] bg-muted relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_2s_infinite]" />
        </div>
        
        {/* Quick info bar */}
        <div className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-center gap-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        </div>
        
        {/* Content skeleton */}
        <div className="container mx-auto px-4 py-8 space-y-8">
          {/* Description */}
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full max-w-2xl" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="h-4 w-3/4 max-w-lg" />
          </div>
          
          {/* Rooms grid */}
          <div className="space-y-4">
            <Skeleton className="h-8 w-32" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border overflow-hidden">
                  <Skeleton className="h-48 w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-5 w-2/3" />
                    <div className="flex gap-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "room") {
    return (
      <div className={cn("animate-in fade-in duration-500", className)}>
        {/* Hero skeleton */}
        <div className="h-[45vh] bg-muted relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_2s_infinite]" />
        </div>
        
        {/* Quick info bar */}
        <div className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-center gap-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>
        </div>
        
        {/* Content skeleton */}
        <div className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Checkout variant
  return (
    <div className={cn("container mx-auto px-4 py-8", className)}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        
        {/* Trip summary card */}
        <div className="rounded-xl border p-6 space-y-4">
          <div className="flex gap-4">
            <Skeleton className="h-24 w-24 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        </div>
        
        {/* Guest details form */}
        <div className="rounded-xl border p-6 space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="space-y-4">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
        
        {/* Price summary */}
        <div className="rounded-xl border p-6 space-y-3">
          <Skeleton className="h-6 w-28" />
          <div className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
          <div className="border-t pt-3 flex justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
        
        {/* Submit button */}
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    </div>
  );
}

// Add shimmer animation to tailwind config
// This component assumes the shimmer keyframe is defined in index.css
