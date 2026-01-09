import { motion } from 'framer-motion';
import { shimmer } from '@/lib/motion';

/**
 * Fashion-week styled loading skeleton
 */
export function EditorialSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Skeleton */}
      <div className="relative h-screen bg-muted overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-background/10 to-transparent"
          animate={shimmer.animate}
        />
        
        {/* Content Skeleton */}
        <div className="absolute bottom-0 left-0 right-0 p-8 sm:p-16 space-y-4">
          <div className="h-12 sm:h-16 w-3/4 max-w-xl bg-muted-foreground/10 rounded-lg animate-pulse" />
          <div className="h-6 w-1/2 max-w-sm bg-muted-foreground/10 rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Facts Skeleton */}
      <div className="py-16 px-8">
        <div className="max-w-2xl mx-auto space-y-4 text-center">
          <div className="h-5 w-2/3 mx-auto bg-muted rounded-lg animate-pulse" />
          <div className="h-5 w-1/2 mx-auto bg-muted rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Rooms Skeleton */}
      <div className="py-16 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="h-4 w-32 mx-auto bg-muted rounded animate-pulse mb-8" />
          <div className="grid md:grid-cols-2 gap-6">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-border">
                <div className="aspect-[16/10] bg-muted animate-pulse" />
                <div className="p-6 space-y-3">
                  <div className="h-6 w-2/3 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
                  <div className="h-8 w-1/3 bg-muted rounded animate-pulse mt-4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
