import { Component, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  onFallback?: () => void;
  fallbackMessage?: string;
  className?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ConciergeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('AI Concierge error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  handleFallback = () => {
    this.props.onFallback?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={cn(
          "flex flex-col items-center justify-center p-6 text-center",
          "bg-muted/30 rounded-xl border border-border",
          this.props.className
        )}>
          <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
          <h3 className="font-medium text-sm mb-1">
            {this.props.fallbackMessage || "Something went wrong"}
          </h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-xs">
            TOBI encountered an issue. You can try again or use manual booking.
          </p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={this.handleRetry}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try Again
            </Button>
            {this.props.onFallback && (
              <Button 
                variant="default" 
                size="sm"
                onClick={this.handleFallback}
              >
                Manual Booking
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook version for functional components
export function useConciergeErrorHandler(onFallback?: () => void) {
  const handleError = (error: Error, context?: string) => {
    console.error(`AI Concierge error${context ? ` (${context})` : ''}:`, error);
    
    // Determine error type for appropriate messaging
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return {
        message: "I'm having trouble connecting. Let me try again...",
        canRetry: true,
        shouldFallback: false,
      };
    }
    
    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return {
        message: "I need a moment to catch my breath. Please try again shortly.",
        canRetry: true,
        shouldFallback: false,
      };
    }
    
    if (error.message.includes('PMS') || error.message.includes('availability')) {
      return {
        message: "I couldn't check availability right now. Let's try the calendar instead.",
        canRetry: false,
        shouldFallback: true,
      };
    }
    
    // Default fallback
    return {
      message: "I didn't quite catch that. Try: '3 nights for 2 adults in March'",
      canRetry: true,
      shouldFallback: false,
    };
  };

  return { handleError };
}
