import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, Building2, Users, BedDouble, MapPin, ExternalLink, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PMSListing {
  id: string;
  name: string;
  status: string;
  type?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  max_guests?: number | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  currency?: string | null;
  base_price?: number | null;
  thumbnail_url?: string | null;
  _raw?: any;
}

interface PMSListingSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemType: 'hostfully' | 'benson' | 'checkfront' | 'cloudbeds' | 'littlehotelier';
  onImport: (listings: PMSListing[], mode: 'create' | 'attach', targetPropertyId?: string) => Promise<void>;
  existingProperties?: { id: string; name: string }[];
}

export function PMSListingSelector({
  open,
  onOpenChange,
  systemType,
  onImport,
  existingProperties = [],
}: PMSListingSelectorProps) {
  const { toast } = useToast();
  const [listings, setListings] = useState<PMSListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<'create' | 'attach'>('create');
  const [targetPropertyId, setTargetPropertyId] = useState<string>("");
  const [importing, setImporting] = useState(false);

  const systemDisplayName = {
    hostfully: 'Hostfully',
    benson: 'Benson',
    checkfront: 'Checkfront',
    cloudbeds: 'Cloudbeds',
    littlehotelier: 'Little Hotelier',
  }[systemType];

  const fetchListings = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke(`${systemType}-api`, {
        body: { action: 'list_properties' },
      });
      
      if (fnError) throw fnError;
      
      if (!data?.success) {
        throw new Error(data?.error?.message || 'Failed to fetch listings');
      }
      
      const fetchedListings: PMSListing[] = (data.data?.properties || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        status: p.status || 'active',
        type: p._raw?.type || p._raw?.propertyType || 'Property',
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        max_guests: p.max_guests,
        address: p.address,
        city: p.city,
        country: p.country,
        currency: p.currency,
        base_price: p.base_price,
        thumbnail_url: p._raw?.pictureLink || p._raw?.picture?.thumbnailUrl || null,
        _raw: p._raw,
      }));
      
      setListings(fetchedListings);
    } catch (err: any) {
      console.error('Error fetching PMS listings:', err);
      setError(err.message || 'Failed to fetch listings');
      toast({
        title: 'Error fetching listings',
        description: err.message || 'Failed to connect to PMS',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchListings();
      setSelectedIds(new Set());
      setImportMode('create');
      setTargetPropertyId("");
    }
  }, [open, systemType]);

  const filteredListings = listings.filter(listing =>
    listing.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    listing.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    listing.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredListings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredListings.map(l => l.id)));
    }
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) {
      toast({
        title: 'No listings selected',
        description: 'Please select at least one listing to import',
        variant: 'destructive',
      });
      return;
    }

    if (importMode === 'attach' && !targetPropertyId) {
      toast({
        title: 'No property selected',
        description: 'Please select a property to attach the listings to',
        variant: 'destructive',
      });
      return;
    }

    setImporting(true);
    try {
      const selectedListings = listings.filter(l => selectedIds.has(l.id));
      await onImport(selectedListings, importMode, importMode === 'attach' ? targetPropertyId : undefined);
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Import failed',
        description: err.message || 'Failed to import listings',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const isActive = status?.toLowerCase() === 'active' || status?.toLowerCase() === 'published';
    return (
      <Badge variant={isActive ? 'default' : 'secondary'} className="text-xs">
        {isActive ? 'Active' : status || 'Unknown'}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Available from {systemDisplayName}
            {listings.length > 0 && (
              <Badge variant="outline" className="ml-2">
                {listings.length} listings
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Select listings to import into RoomsOnline. You can create new properties or attach to existing ones.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, city, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={fetchListings}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-12 w-12 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-lg font-medium">Failed to load listings</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={fetchListings}>
              Try Again
            </Button>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No listings found</p>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'Try a different search term' : `No listings available in ${systemDisplayName}`}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedIds.size === filteredListings.length && filteredListings.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                </span>
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
              <div className="space-y-2 py-2">
                {filteredListings.map(listing => (
                  <div
                    key={listing.id}
                    className={cn(
                      "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                      selectedIds.has(listing.id) ? "bg-primary/5 border-primary" : "hover:bg-muted/50"
                    )}
                    onClick={() => toggleSelection(listing.id)}
                  >
                    <Checkbox
                      checked={selectedIds.has(listing.id)}
                      onCheckedChange={() => toggleSelection(listing.id)}
                    />
                    
                    {listing.thumbnail_url ? (
                      <img
                        src={listing.thumbnail_url}
                        alt={listing.name}
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                        <Building2 className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{listing.name}</span>
                        {getStatusBadge(listing.status)}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                        {listing.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {listing.city}{listing.country ? `, ${listing.country}` : ''}
                          </span>
                        )}
                        {listing.bedrooms && (
                          <span className="flex items-center gap-1">
                            <BedDouble className="h-3 w-3" />
                            {listing.bedrooms} bed
                          </span>
                        )}
                        {listing.max_guests && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {listing.max_guests} guests
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {listing.base_price && (
                      <div className="text-right">
                        <span className="font-medium">
                          {listing.currency || '$'}{listing.base_price}
                        </span>
                        <span className="text-xs text-muted-foreground block">/night</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        {selectedIds.size > 0 && (
          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Import as:</span>
              <div className="flex gap-2">
                <Button
                  variant={importMode === 'create' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setImportMode('create')}
                >
                  Create New Properties
                </Button>
                <Button
                  variant={importMode === 'attach' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setImportMode('attach')}
                  disabled={existingProperties.length === 0}
                >
                  Attach to Existing
                </Button>
              </div>
            </div>

            {importMode === 'attach' && (
              <div className="flex items-center gap-2">
                <span className="text-sm">Target property:</span>
                <Select value={targetPropertyId} onValueChange={setTargetPropertyId}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select a property" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingProperties.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedIds.size === 0 || importing}
            className="gap-2"
          >
            {importing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Import {selectedIds.size} {selectedIds.size === 1 ? 'Listing' : 'Listings'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
