import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// Types
type Rates = Record<string, number>;

interface CurrencyContextType {
  currency: string;
  setCurrency: (currency: string) => void;
  rates: Rates | null;
  isLoading: boolean;
  lastUpdated: Date | null;
  isStale: boolean;
  convert: (amount: number) => number;
  formatPrice: (amount: number, showSymbol?: boolean) => string;
}

// Constants
export const BASE_CURRENCY = 'ZAR';
export const SUPPORTED_CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  ZAR: 'R',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CAD: 'C$',
  CHF: 'CHF',
};

export const CURRENCY_NAMES: Record<string, string> = {
  ZAR: 'South African Rand',
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
};

const CACHE_KEY = 'currency_rates_cache';
const PREFERENCE_KEY = 'preferred_currency';
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedRates {
  rates: Rates;
  timestamp: number;
}

// Context
const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

// Rate fetching functions
async function fetchFromFrankfurter(): Promise<Rates> {
  const response = await fetch('https://api.frankfurter.app/latest?from=ZAR');
  if (!response.ok) throw new Error('Frankfurter API failed');
  const data = await response.json();
  // Frankfurter returns rates FROM ZAR, so we need to add ZAR itself
  return { ZAR: 1, ...data.rates };
}

async function fetchFromFawazahmed(): Promise<Rates> {
  const response = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/zar.json');
  if (!response.ok) throw new Error('Fawazahmed API failed');
  const data = await response.json();
  // This API returns lowercase keys, normalize them
  const zarRates = data.zar;
  return {
    ZAR: 1,
    USD: zarRates.usd,
    EUR: zarRates.eur,
    GBP: zarRates.gbp,
    AUD: zarRates.aud,
    CAD: zarRates.cad,
    CHF: zarRates.chf,
  };
}

async function fetchFromExchangeRateAPI(): Promise<Rates> {
  const response = await fetch('https://open.er-api.com/v6/latest/ZAR');
  if (!response.ok) throw new Error('ExchangeRate API failed');
  const data = await response.json();
  return { ZAR: 1, ...data.rates };
}

async function fetchRatesWithFallback(): Promise<Rates> {
  // Try CORS-friendly CDN source first for embedded/white-label domains
  try {
    return await fetchFromFawazahmed();
  } catch (e) {
    console.warn('Fawazahmed API failed, trying fallback...', e);
  }

  // Try secondary source
  try {
    return await fetchFromExchangeRateAPI();
  } catch (e) {
    console.warn('ExchangeRate API failed, trying fallback...', e);
  }

  // Try tertiary source
  try {
    return await fetchFromFrankfurter();
  } catch (e) {
    console.warn('Frankfurter API failed', e);
  }

  throw new Error('All rate APIs failed');
}

// Provider
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(PREFERENCE_KEY) || BASE_CURRENCY;
    }
    return BASE_CURRENCY;
  });
  const [rates, setRates] = useState<Rates | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);

  // Persist currency preference
  const setCurrency = useCallback((newCurrency: string) => {
    setCurrencyState(newCurrency);
    if (typeof window !== 'undefined') {
      localStorage.setItem(PREFERENCE_KEY, newCurrency);
    }
  }, []);

  // Load cached rates
  const loadCachedRates = useCallback((): CachedRates | null => {
    if (typeof window === 'undefined') return null;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.warn('Failed to parse cached rates', e);
    }
    return null;
  }, []);

  // Save rates to cache
  const cacheRates = useCallback((newRates: Rates) => {
    if (typeof window !== 'undefined') {
      const cacheData: CachedRates = {
        rates: newRates,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    }
  }, []);

  // Fetch rates with caching logic
  const fetchRates = useCallback(async () => {
    const cached = loadCachedRates();
    const now = Date.now();

    // Check if cache is still fresh
    if (cached && (now - cached.timestamp) < CACHE_DURATION_MS) {
      setRates(cached.rates);
      setLastUpdated(new Date(cached.timestamp));
      setIsStale(false);
      setIsLoading(false);
      return;
    }

    // Cache exists but is stale - use it while fetching new rates
    if (cached) {
      setRates(cached.rates);
      setLastUpdated(new Date(cached.timestamp));
      setIsStale((now - cached.timestamp) > STALE_THRESHOLD_MS);
    }

    setIsLoading(true);

    try {
      const newRates = await fetchRatesWithFallback();
      setRates(newRates);
      setLastUpdated(new Date());
      setIsStale(false);
      cacheRates(newRates);
    } catch (e) {
      console.error('Failed to fetch rates:', e);
      // Keep using cached rates if available
      if (cached) {
        setIsStale(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [loadCachedRates, cacheRates]);

  // Initial fetch
  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  // Convert amount from ZAR to selected currency
  const convert = useCallback((amount: number): number => {
    if (!rates || currency === BASE_CURRENCY) {
      return amount;
    }
    const rate = rates[currency];
    if (!rate) {
      console.warn(`No rate found for ${currency}, returning base amount`);
      return amount;
    }
    return amount * rate;
  }, [rates, currency]);

  // Format price with currency symbol
  const formatPrice = useCallback((amount: number, showSymbol = true): string => {
    const convertedAmount = convert(amount);
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    
    // Format with appropriate decimal places and locale
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(convertedAmount);

    return showSymbol ? `${symbol} ${formatted}` : formatted;
  }, [convert, currency]);

  const value: CurrencyContextType = {
    currency,
    setCurrency,
    rates,
    isLoading,
    lastUpdated,
    isStale,
    convert,
    formatPrice,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

// Hook
export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
