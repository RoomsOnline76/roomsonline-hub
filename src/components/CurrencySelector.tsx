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

// Currency to country code mapping for styled badges
const CURRENCY_COUNTRY_CODES: Record<string, string> = {
  ZAR: 'ZA',
  USD: 'US',
  EUR: 'EU',
  GBP: 'GB',
  AUD: 'AU',
  CAD: 'CA',
  CHF: 'CH',
};

// Country code badge colors
const COUNTRY_COLORS: Record<string, string> = {
  ZA: 'bg-emerald-600',
  US: 'bg-blue-600',
  EU: 'bg-indigo-600',
  GB: 'bg-red-600',
  AU: 'bg-amber-600',
  CA: 'bg-rose-600',
  CH: 'bg-red-500',
};

interface CurrencySelectorProps {
  compact?: boolean;
  className?: string;
  variant?: 'default' | 'hero';
}

function CountryBadge({ code, size = 'sm' }: { code: string; size?: 'sm' | 'md' }) {
  const colorClass = COUNTRY_COLORS[code] || 'bg-gray-600';
  return (
    <span className={cn(
      "inline-flex items-center justify-center rounded text-white font-bold uppercase",
      colorClass,
      size === 'sm' ? "w-5 h-3.5 text-[8px]" : "w-6 h-4 text-[9px]"
    )}>
      {code}
    </span>
  );
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
              <CountryBadge code={CURRENCY_COUNTRY_CODES[currency]} size="sm" />
              <span>{currency}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-background/95 backdrop-blur-md border-border z-50">
          {SUPPORTED_CURRENCIES.map((code) => (
            <SelectItem key={code} value={code}>
              <span className="flex items-center gap-3">
                <CountryBadge code={CURRENCY_COUNTRY_CODES[code]} size="md" />
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
