import { Loader2, ShieldAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecaptchaOverlayProps {
  isVerifying: boolean;
  error: string | null;
  onRetry: () => void;
}

export function RecaptchaOverlay({ isVerifying, error, onRetry }: RecaptchaOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4 p-8 rounded-lg bg-card border border-border shadow-lg max-w-sm mx-4">
        {isVerifying ? (
          <>
            <Loader2 
              className="h-10 w-10 animate-spin text-primary" 
              aria-label="Verifying you're human"
            />
            <div className="text-center">
              <p className="text-foreground font-medium">Verifying you're human...</p>
              <p className="text-sm text-muted-foreground mt-1">This won't take long</p>
            </div>
          </>
        ) : error ? (
          <>
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <div className="text-center">
              <p className="text-foreground font-medium">Verification failed</p>
              <p className="text-sm text-muted-foreground mt-1">
                We couldn't verify you're human. Please try again.
              </p>
            </div>
            <Button onClick={onRetry} className="mt-2 gap-2">
              <RefreshCw className="h-4 w-4" />
              Verify Again
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}