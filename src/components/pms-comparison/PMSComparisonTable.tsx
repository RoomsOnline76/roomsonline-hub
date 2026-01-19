import { useState } from "react";
import { Check, X, ChevronUp, ChevronDown, Info, AlertCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { pmsCapabilities, PMSCapability } from "./pmsCapabilitiesData";

type SortField = 'name' | 'liveAvailability' | 'rateFetching' | 'createBooking' | 'modifyBooking' | 'cancelBooking' | 'webhooks';
type SortDirection = 'asc' | 'desc';

const capabilityTooltips: Record<string, string> = {
  liveAvailability: "Real-time availability checks directly from the PMS before displaying to guests",
  rateFetching: "Ability to fetch current pricing and rate plans from the PMS",
  createBooking: "Create new reservations directly in the PMS via API",
  modifyBooking: "Update existing reservations (dates, guests, rooms) via API",
  cancelBooking: "Cancel reservations directly in the PMS via API",
  webhooks: "Receive real-time push notifications when bookings change in the PMS"
};

export function PMSComparisonTable() {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState({
    liveAvailability: false,
    createBooking: false,
    productionOnly: false
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredData = pmsCapabilities.filter(pms => {
    if (filters.liveAvailability && !pms.liveAvailability) return false;
    if (filters.createBooking && !pms.createBooking) return false;
    if (filters.productionOnly && pms.integrationStatus !== 'production') return false;
    return true;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    let aVal: string | boolean = a[sortField];
    let bVal: string | boolean = b[sortField];
    
    if (typeof aVal === 'boolean') {
      aVal = aVal ? '1' : '0';
      bVal = bVal ? '1' : '0';
    }
    
    const comparison = String(aVal).localeCompare(String(bVal));
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {children}
      {sortField === field && (
        sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      )}
    </button>
  );

  const CapabilityCell = ({ value, note }: { value: boolean; note?: string }) => (
    <div className="flex items-center gap-1">
      {value ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground/50" />
      )}
      {note && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <AlertCircle className="h-3 w-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">{note}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );

  const HeaderWithTooltip = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1 cursor-help">
            {children}
            <Info className="h-3 w-3 text-muted-foreground" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{capabilityTooltips[field]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 bg-muted/30 rounded-lg">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={filters.liveAvailability}
            onCheckedChange={(checked) => setFilters(f => ({ ...f, liveAvailability: checked as boolean }))}
          />
          Live Availability Only
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={filters.createBooking}
            onCheckedChange={(checked) => setFilters(f => ({ ...f, createBooking: checked as boolean }))}
          />
          Can Create Bookings
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={filters.productionOnly}
            onCheckedChange={(checked) => setFilters(f => ({ ...f, productionOnly: checked as boolean }))}
          />
          Production Ready Only
        </label>
      </div>

      {/* Table with horizontal scroll on mobile */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="min-w-[140px]">
                <SortHeader field="name">PMS System</SortHeader>
              </TableHead>
              <TableHead className="text-center min-w-[100px]">
                <SortHeader field="liveAvailability">
                  <HeaderWithTooltip field="liveAvailability">Live Avail.</HeaderWithTooltip>
                </SortHeader>
              </TableHead>
              <TableHead className="text-center min-w-[100px]">
                <SortHeader field="rateFetching">
                  <HeaderWithTooltip field="rateFetching">Rates</HeaderWithTooltip>
                </SortHeader>
              </TableHead>
              <TableHead className="text-center min-w-[100px]">
                <SortHeader field="createBooking">
                  <HeaderWithTooltip field="createBooking">Create</HeaderWithTooltip>
                </SortHeader>
              </TableHead>
              <TableHead className="text-center min-w-[100px]">
                <SortHeader field="modifyBooking">
                  <HeaderWithTooltip field="modifyBooking">Modify</HeaderWithTooltip>
                </SortHeader>
              </TableHead>
              <TableHead className="text-center min-w-[100px]">
                <SortHeader field="cancelBooking">
                  <HeaderWithTooltip field="cancelBooking">Cancel</HeaderWithTooltip>
                </SortHeader>
              </TableHead>
              <TableHead className="text-center min-w-[100px]">
                <SortHeader field="webhooks">
                  <HeaderWithTooltip field="webhooks">Webhooks</HeaderWithTooltip>
                </SortHeader>
              </TableHead>
              <TableHead className="min-w-[140px]">Best For</TableHead>
              <TableHead className="min-w-[100px]">Region</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((pms) => (
              <TableRow 
                key={pms.key}
                className={cn(
                  pms.integrationStatus === 'development' && "bg-amber-50/50 dark:bg-amber-950/20"
                )}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {pms.name}
                    {pms.integrationStatus === 'development' && (
                      <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                        In Dev
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <CapabilityCell value={pms.liveAvailability} note={pms.note} />
                </TableCell>
                <TableCell className="text-center">
                  <CapabilityCell value={pms.rateFetching} />
                </TableCell>
                <TableCell className="text-center">
                  <CapabilityCell value={pms.createBooking} note={pms.key === 'nightsbridge' ? pms.note : undefined} />
                </TableCell>
                <TableCell className="text-center">
                  <CapabilityCell value={pms.modifyBooking} />
                </TableCell>
                <TableCell className="text-center">
                  <CapabilityCell value={pms.cancelBooking} />
                </TableCell>
                <TableCell className="text-center">
                  <CapabilityCell value={pms.webhooks} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{pms.bestFor}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{pms.regionalFocus}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground text-right">
        Last updated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
  );
}
