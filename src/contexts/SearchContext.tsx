import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface PropertySearchResult {
  id: string;
  name: string;
  city: string;
  country: string;
  slug: string | null;
  images: unknown;
  navigation_tags: string[] | null;
  external_system: string | null;
}

interface SearchContextType {
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: PropertySearchResult[];
  setSearchResults: (results: PropertySearchResult[]) => void;
  selectedProperty: PropertySearchResult | null;
  setSelectedProperty: (property: PropertySearchResult | null) => void;
  resetSearch: () => void;
}

const SearchContext = createContext<SearchContextType | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PropertySearchResult[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<PropertySearchResult | null>(null);

  const resetSearch = useCallback(() => {
    setIsExpanded(false);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedProperty(null);
  }, []);

  return (
    <SearchContext.Provider
      value={{
        isExpanded,
        setIsExpanded,
        searchQuery,
        setSearchQuery,
        searchResults,
        setSearchResults,
        selectedProperty,
        setSelectedProperty,
        resetSearch,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used within a SearchProvider");
  }
  return context;
}

export type { PropertySearchResult };
