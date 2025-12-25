import { MapPin } from "lucide-react";
import { PropertySearchResult } from "@/contexts/SearchContext";

interface SearchResultsDropdownProps {
  results: PropertySearchResult[];
  onSelect: (property: PropertySearchResult) => void;
  isVisible: boolean;
}

export function SearchResultsDropdown({ results, onSelect, isVisible }: SearchResultsDropdownProps) {
  if (!isVisible || results.length === 0) return null;

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-background border border-border rounded-lg shadow-xl max-h-[300px] overflow-y-auto z-50">
      {results.map((property) => (
        <button
          key={property.id}
          onClick={() => onSelect(property)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left border-b border-border/50 last:border-b-0"
        >
          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{property.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {property.city}, {property.country}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
