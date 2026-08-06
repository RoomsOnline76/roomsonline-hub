import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CrmAccount } from "@/hooks/useCrmAccounts";
import type { CrmAccountType } from "@/lib/crmSegmentation";

interface CrmAccountPickerProps {
  accounts: CrmAccount[];
  /** Restrict the list to these account types. */
  types: CrmAccountType[];
  value: string | null;
  onChange: (id: string | null, account: CrmAccount | null) => void;
  placeholder?: string;
  /** Opens the account editor pre-set to the first allowed type. */
  onCreateNew?: (type: CrmAccountType, initialName: string) => void;
  className?: string;
  disabled?: boolean;
}

/** Searchable picker for a linked CRM profile (company, agent, source). */
export function CrmAccountPicker({
  accounts,
  types,
  value,
  onChange,
  placeholder = "Not linked",
  onCreateNew,
  className,
  disabled,
}: CrmAccountPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const options = useMemo(
    () => accounts.filter((a) => types.includes(a.account_type) && a.is_active),
    [accounts, types],
  );
  const selected = useMemo(() => accounts.find((a) => a.id === value) || null, [accounts, value]);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="h-9 flex-1 justify-between font-normal"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.name : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter>
            <CommandInput placeholder="Search profiles..." value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No matching profile.
                </div>
              </CommandEmpty>
              <CommandGroup>
                {options.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`${a.name} ${a.email ?? ""} ${a.vat_number ?? ""}`}
                    onSelect={() => {
                      onChange(a.id, a);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5", value === a.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{a.name}</span>
                    {a.email && (
                      <span className="ml-auto truncate pl-2 text-[10px] text-muted-foreground">{a.email}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              {onCreateNew && (
                <CommandGroup>
                  <CommandItem
                    value="__create__"
                    onSelect={() => {
                      setOpen(false);
                      onCreateNew(types[0], search);
                    }}
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Create new profile{search ? ` "${search}"` : ""}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && !disabled && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-8 shrink-0"
          title="Unlink"
          onClick={() => onChange(null, null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
