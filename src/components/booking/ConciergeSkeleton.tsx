import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ConciergeSkeletonProps {
  variant: 'panel' | 'suggestions' | 'cart' | 'checkout';
  className?: string;
}

export function ConciergeSkeleton({ variant, className }: ConciergeSkeletonProps) {
  if (variant === 'panel') {
    return (
      <div className={cn("space-y-4 p-4", className)}>
        {/* Message bubbles skeleton */}
        <div className="flex justify-start">
          <div className="max-w-[75%] space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-10 w-32 rounded-full" />
        </div>
        <div className="flex justify-start">
          <div className="max-w-[75%] space-y-2">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        {/* Suggestion cards skeleton */}
        <div className="space-y-2 mt-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (variant === 'suggestions') {
    return (
      <div className={cn("space-y-2", className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3 border rounded-xl space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <div className="flex justify-between items-center">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'cart') {
    return (
      <div className={cn("p-4 space-y-3", className)}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="pt-3 border-t flex justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
    );
  }

  if (variant === 'checkout') {
    return (
      <div className={cn("p-4 space-y-4", className)}>
        {/* Order summary skeleton */}
        <div className="border rounded-xl p-4 space-y-3">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-3">
            <Skeleton className="h-16 w-16 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
        {/* Guest details skeleton */}
        <div className="border rounded-xl p-4 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        {/* Button skeleton */}
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  return null;
}
