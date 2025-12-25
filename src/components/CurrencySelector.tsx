import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  useCurrency, 
  SUPPORTED_CURRENCIES, 
  CURRENCY_SYMBOLS, 
  CURRENCY_NAMES 
} from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';

interface CurrencySelectorProps {
  compact?: boolean;
  className?: string;
}

export function CurrencySelector({ compact = false, className }: CurrencySelectorProps) {
  const { currency, setCurrency, isStale } = useCurrency();

  return (
    <div className={cn("relative", className)}>
      <Select value={currency} onValueChange={setCurrency}>
        <SelectTrigger 
          className={cn(
            "bg-background border-border",
            compact ? "w-[80px]" : "w-[180px]"
          )}
        >
          <SelectValue>
            {compact 
              ? currency 
              : `${CURRENCY_SYMBOLS[currency]} ${currency}`
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_CURRENCIES.map((code) => (
            <SelectItem key={code} value={code}>
              <span className="flex items-center gap-2">
                <span className="font-medium w-6">{CURRENCY_SYMBOLS[code]}</span>
                <span>{code}</span>
                {!compact && (
                  <span className="text-muted-foreground text-sm ml-1">
                    - {CURRENCY_NAMES[code]}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isStale && (
        <span className="absolute -bottom-5 left-0 text-xs text-muted-foreground">
          Rates may be outdated
        </span>
      )}
    </div>
  );
}
