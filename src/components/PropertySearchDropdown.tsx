import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, Building2, User, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Property {
  id: string;
  name: string;
  owner_email?: string | null;
  owner_name?: string | null;
  property_type?: string;
}

interface PropertySearchDropdownProps {
  properties: Property[];
  selectedPropertyId: string;
  onPropertyChange: (value: string) => void;
  includeAllOption?: boolean;
  placeholder?: string;
  className?: string;
}

export function PropertySearchDropdown({
  properties,
  selectedPropertyId,
  onPropertyChange,
  includeAllOption = true,
  placeholder = "Select property",
  className,
}: PropertySearchDropdownProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedProperty = useMemo(() => {
    if (selectedPropertyId === "all") return null;
    return properties.find((p) => p.id === selectedPropertyId);
  }, [properties, selectedPropertyId]);

  const filteredProperties = useMemo(() => {
    if (!searchQuery) return properties;
    
    const query = searchQuery.toLowerCase();
    return properties.filter((p) => {
      const nameMatch = p.name?.toLowerCase().includes(query);
      const ownerMatch = (p.owner_name || p.owner_email || "").toLowerCase().includes(query);
      const typeMatch = (p.property_type || "").toLowerCase().includes(query);
      return nameMatch || ownerMatch || typeMatch;
    });
  }, [properties, searchQuery]);

  const getOwnerDisplay = (property: Property) => {
    if (property.owner_name) return property.owner_name;
    if (property.owner_email) {
      // Extract name from email (before @)
      const emailName = property.owner_email.split("@")[0];
      return emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }
    return "—";
  };

  const getPropertyTypeLabel = (type?: string) => {
    if (!type) return "—";
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-[300px] justify-between", className)}
        >
          <span className="truncate">
            {selectedPropertyId === "all"
              ? "All properties"
              : selectedProperty?.name || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[450px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Search by name, owner, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <CommandList>
            <CommandEmpty>No property found.</CommandEmpty>
            <CommandGroup>
              {/* Header row */}
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
                <div className="flex-1 flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  <span>Name</span>
                </div>
                <div className="w-[100px] flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span>Owner</span>
                </div>
                <div className="w-[80px] flex items-center gap-1">
                  <Home className="h-3 w-3" />
                  <span>Type</span>
                </div>
              </div>
              
              {includeAllOption && (
                <CommandItem
                  value="all"
                  onSelect={() => {
                    onPropertyChange("all");
                    setOpen(false);
                    setSearchQuery("");
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      selectedPropertyId === "all" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex-1 font-medium">All properties</div>
                  <div className="w-[100px] text-muted-foreground text-sm">—</div>
                  <div className="w-[80px] text-muted-foreground text-sm">—</div>
                </CommandItem>
              )}
              
              {filteredProperties.map((property) => (
                <CommandItem
                  key={property.id}
                  value={property.id}
                  onSelect={() => {
                    onPropertyChange(property.id);
                    setOpen(false);
                    setSearchQuery("");
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      selectedPropertyId === property.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex-1 truncate font-medium">{property.name}</div>
                  <div className="w-[100px] truncate text-muted-foreground text-sm">
                    {getOwnerDisplay(property)}
                  </div>
                  <div className="w-[80px] truncate text-muted-foreground text-sm">
                    {getPropertyTypeLabel(property.property_type)}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
