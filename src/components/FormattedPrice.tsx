import { useCurrency, CURRENCY_SYMBOLS, BASE_CURRENCY } from '@/contexts/CurrencyContext';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface FormattedPriceProps {
  amount: number;
  showSymbol?: boolean;
  className?: string;
  showLoading?: boolean;
}

export function FormattedPrice({ 
  amount, 
  showSymbol = true, 
  className,
  showLoading = true 
}: FormattedPriceProps) {
  const { formatPrice, isLoading, rates, currency } = useCurrency();

  // Show skeleton while loading and no cached rates exist
  if (isLoading && !rates && showLoading) {
    return <Skeleton className={cn("h-5 w-16 inline-block", className)} />;
  }

  // If no rates available, show base currency (ZAR)
  if (!rates) {
    const symbol = CURRENCY_SYMBOLS[BASE_CURRENCY];
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    
    return (
      <span className={className}>
        {showSymbol ? `${symbol} ${formatted}` : formatted}
      </span>
    );
  }

  return (
    <span className={className}>
      {formatPrice(amount, showSymbol)}
    </span>
  );
}
