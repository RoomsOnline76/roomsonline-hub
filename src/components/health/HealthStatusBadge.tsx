import { cn } from "@/lib/utils";

interface HealthStatusBadgeProps {
  status: 'healthy' | 'degraded' | 'failed' | 'unknown' | string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function HealthStatusBadge({ status, size = 'md', showLabel = true }: HealthStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'healthy':
        return {
          color: 'bg-green-500',
          bgColor: 'bg-green-500/10',
          textColor: 'text-green-700 dark:text-green-400',
          label: 'Healthy',
        };
      case 'degraded':
        return {
          color: 'bg-yellow-500',
          bgColor: 'bg-yellow-500/10',
          textColor: 'text-yellow-700 dark:text-yellow-400',
          label: 'Degraded',
        };
      case 'failed':
        return {
          color: 'bg-red-500',
          bgColor: 'bg-red-500/10',
          textColor: 'text-red-700 dark:text-red-400',
          label: 'Failed',
        };
      case 'unknown':
        return {
          color: 'bg-gray-400',
          bgColor: 'bg-gray-400/10',
          textColor: 'text-gray-600 dark:text-gray-400',
          label: 'Not verified',
        };
      default:
        return {
          color: 'bg-gray-400',
          bgColor: 'bg-gray-400/10',
          textColor: 'text-gray-600 dark:text-gray-400',
          label: 'Unknown',
        };
    }
  };

  const config = getStatusConfig();
  
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const paddingClasses = {
    sm: 'px-2 py-0.5',
    md: 'px-2.5 py-1',
    lg: 'px-3 py-1.5',
  };

  if (!showLabel) {
    return (
      <span className={cn(sizeClasses[size], config.color, 'rounded-full inline-block')} />
    );
  }

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-medium',
      config.bgColor,
      config.textColor,
      textSizeClasses[size],
      paddingClasses[size]
    )}>
      <span className={cn(sizeClasses[size], config.color, 'rounded-full')} />
      {config.label}
    </span>
  );
}
