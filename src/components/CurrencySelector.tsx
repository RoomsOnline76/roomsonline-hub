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
import 'flag-icons/css/flag-icons.min.css';

// Currency to ISO country code mapping for flag-icons
const CURRENCY_COUNTRY_CODES: Record<string, string> = {
  ZAR: 'za',
  USD: 'us',
  EUR: 'eu',
  GBP: 'gb',
  AUD: 'au',
  CAD: 'ca',
  CHF: 'ch',
};

interface CurrencySelectorProps {
  compact?: boolean;
  className?: string;
  variant?: 'default' | 'hero';
}

export function CurrencySelector({ compact = false, className, variant = 'default' }: CurrencySelectorProps) {
  const { currency, setCurrency, isStale } = useCurrency();

  const isHero = variant === 'hero' || className?.includes('hero');

  return (
    <div className={cn("relative", className)}>
      <Select value={currency} onValueChange={setCurrency}>
        <SelectTrigger 
          className={cn(
            compact ? "w-[100px]" : "w-[180px]",
            isHero || compact 
              ? "bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 focus:ring-white/30" 
              : "bg-background border-border"
          )}
        >
          <SelectValue>
            <span className="flex items-center gap-2">
              <span className={`fi fi-${CURRENCY_COUNTRY_CODES[currency]} rounded-sm`} style={{ fontSize: '1rem' }} />
              <span>{currency}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-background/95 backdrop-blur-md border-border z-50">
          {SUPPORTED_CURRENCIES.map((code) => (
            <SelectItem key={code} value={code}>
              <span className="flex items-center gap-3">
                <span className={`fi fi-${CURRENCY_COUNTRY_CODES[code]} rounded-sm`} style={{ fontSize: '1.25rem' }} />
                <span className="font-medium w-8">{CURRENCY_SYMBOLS[code]}</span>
                <span className="font-medium">{code}</span>
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
