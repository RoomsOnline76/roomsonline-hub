import { useCallback, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  DIAL_COUNTRIES,
  countryByIso,
  joinPhone,
  splitPhone,
  type DialCountry,
} from "@/lib/dialCodes";

interface CountryComboboxProps {
  /** ISO alpha-2 code, or null when nothing is chosen. */
  value: string | null;
  onChange: (iso: string) => void;
  /** Show the dial code alongside the country name. */
  showDial?: boolean;
  placeholder?: string;
  /** Trigger renders as a compact code-only button (used inside the phone field). */
  compactTrigger?: boolean;
  className?: string;
  disabled?: boolean;
}

/** Searchable country picker — matches on country name, ISO code or dial code. */
export function CountryCombobox({
  value,
  onChange,
  showDial = true,
  placeholder = "Select country",
  compactTrigger,
  className,
  disabled,
}: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = countryByIso(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 justify-between font-normal",
            compactTrigger ? "w-[104px] shrink-0 px-2" : "w-full",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {selected ? (
              <>
                <span aria-hidden>{selected.flag}</span>
                <span className="truncate">
                  {compactTrigger ? selected.dial : selected.name}
                  {!compactTrigger && showDial ? ` ${selected.dial}` : ""}
                </span>
              </>
            ) : (
              <span className="truncate text-muted-foreground">
                {compactTrigger ? "Code" : placeholder}
              </span>
            )}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const q = search.trim().toLowerCase().replace(/^\+/, "");
            if (!q) return 1;
            return itemValue.toLowerCase().replace(/\+/g, "").includes(q) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search country or +code..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {DIAL_COUNTRIES.map((c: DialCountry) => (
                <CommandItem
                  key={c.iso}
                  value={`${c.name} ${c.iso} ${c.dial}`}
                  onSelect={() => {
                    onChange(c.iso);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === c.iso ? "opacity-100" : "opacity-0")}
                  />
                  <span className="mr-2" aria-hidden>{c.flag}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{c.dial}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface PhoneInputProps {
  /** Combined value, e.g. "+27821234567". */
  value: string;
  onChange: (next: string) => void;
  /** ISO of the dial code shown; the caller keeps it so it can be pre-filled. */
  countryIso: string | null;
  onCountryIsoChange: (iso: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Phone capture as a searchable dial-code selector plus the local number.
 * The two are joined into one E.164-style string so callers store a single value.
 */
export function PhoneInput({
  value,
  onChange,
  countryIso,
  onCountryIsoChange,
  placeholder = "82 123 4567",
  disabled,
  className,
}: PhoneInputProps) {
  const parts = useMemo(() => splitPhone(value), [value]);
  const activeIso = parts.iso || countryIso;
  const dial = countryByIso(activeIso)?.dial || "";

  const setLocal = useCallback(
    (local: string) => onChange(joinPhone(dial, local)),
    [dial, onChange],
  );

  const setIso = useCallback(
    (iso: string) => {
      onCountryIsoChange(iso);
      const nextDial = countryByIso(iso)?.dial || "";
      onChange(joinPhone(nextDial, parts.local));
    },
    [onChange, onCountryIsoChange, parts.local],
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <CountryCombobox value={activeIso} onChange={setIso} compactTrigger disabled={disabled} />
      <Input
        value={parts.local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        inputMode="tel"
        disabled={disabled}
        className="flex-1"
      />
    </div>
  );
}
