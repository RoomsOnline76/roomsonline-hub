import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Info } from "lucide-react";
import { FormattedPrice } from "@/components/FormattedPrice";
import {
  calculateCharges,
  groupChargesByCategory,
  getChargeTotals,
  type PropertyCharge,
  type ChargeCalculationContext,
  type CalculatedCharge,
} from "./ChargeCalculator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ChargePreviewProps {
  charges: PropertyCharge[];
  accommodationSubtotal?: number;
  nights?: number;
  rooms?: number;
  adults?: number;
  children?: number;
  infants?: number;
  compact?: boolean;
  roomTypes?: { id: string; name: string }[];
}

export function ChargePreview({
  charges,
  accommodationSubtotal = 1800,
  nights = 2,
  rooms = 1,
  adults = 2,
  children = 0,
  infants = 0,
  compact = false,
  roomTypes = [],
}: ChargePreviewProps) {
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>(
    roomTypes.length > 0 ? roomTypes[0].id : "__all__"
  );

  const context: ChargeCalculationContext = useMemo(() => ({
    subtotal: accommodationSubtotal,
    nights,
    rooms,
    adults,
    children,
    infants,
    roomTypeId: selectedRoomTypeId === "__all__" ? undefined : selectedRoomTypeId,
  }), [accommodationSubtotal, nights, rooms, adults, children, infants, selectedRoomTypeId]);

  const calculatedCharges = useMemo(() => 
    calculateCharges(charges, context),
    [charges, context]
  );

  const grouped = useMemo(() => 
    groupChargesByCategory(calculatedCharges),
    [calculatedCharges]
  );

  const totals = useMemo(() => 
    getChargeTotals(calculatedCharges),
    [calculatedCharges]
  );

  const grandTotal = accommodationSubtotal + totals.total;

  const renderChargeGroup = (
    title: string,
    charges: CalculatedCharge[],
    isRefundable = false
  ) => {
    if (charges.length === 0) return null;

    return (
      <div className={`space-y-2 ${isRefundable ? 'bg-green-50/50 dark:bg-green-950/20 -mx-4 px-4 py-3 rounded-lg' : ''}`}>
        <div className={`text-xs font-semibold uppercase tracking-wider ${
          isRefundable ? 'text-green-700 dark:text-green-400 flex items-center gap-1' : 'text-muted-foreground'
        }`}>
          {isRefundable && <CheckCircle className="h-3 w-3" />}
          {title}
        </div>
        {charges.map((calc) => (
          <div key={calc.charge.id} className="flex justify-between items-start text-sm">
            <div className="flex-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">
                      {calc.charge.name}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <p className="text-xs">{calc.breakdown}</p>
                    {calc.charge.description && (
                      <p className="text-xs text-muted-foreground mt-1">{calc.charge.description}</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {isRefundable && calc.charge.refund_timing && (
                <div className="text-xs text-muted-foreground">
                  (Refunded {calc.charge.refund_timing === 'on_checkout' ? 'at checkout' : 
                    calc.charge.refund_timing === 'after_inspection' ? 'after inspection' : 'manually'})
                </div>
              )}
            </div>
            <FormattedPrice 
              amount={calc.calculatedAmount} 
              className="font-medium tabular-nums" 
            />
          </div>
        ))}
      </div>
    );
  };

  if (compact) {
    return (
      <div className="space-y-2 text-sm">
        {calculatedCharges.length === 0 ? (
          <p className="text-muted-foreground italic">No additional charges configured</p>
        ) : (
          <>
            {calculatedCharges.map((calc) => (
              <div key={calc.charge.id} className="flex justify-between">
                <span className="flex items-center gap-1">
                  {calc.charge.name}
                  {calc.charge.is_refundable && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 bg-green-50 text-green-700 border-green-200">
                      Refundable
                    </Badge>
                  )}
                </span>
                <FormattedPrice amount={calc.calculatedAmount} />
              </div>
            ))}
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Charges Total</span>
              <FormattedPrice amount={totals.total} />
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Guest Preview
          <Badge variant="secondary" className="text-xs font-normal">
            {calculatedCharges.length} charges
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Room type selector */}
        {roomTypes.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Preview as</label>
            <Select value={selectedRoomTypeId} onValueChange={setSelectedRoomTypeId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roomTypes.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id} className="text-xs">
                    {rt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Sample booking context */}
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded flex items-center gap-1">
          <Info className="h-3 w-3" />
          Preview based on {nights} nights, {rooms} room(s), {adults} adult(s)
          {selectedRoomTypeId !== "__all__" && roomTypes.length > 0 && (
            <>, {roomTypes.find(r => r.id === selectedRoomTypeId)?.name}</>
          )}
        </div>

        {/* Accommodation */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Rent
          </div>
          <div className="flex justify-between text-sm">
            <span>{nights} night{nights > 1 ? 's' : ''}</span>
            <FormattedPrice amount={accommodationSubtotal} className="font-medium" />
          </div>
        </div>

        {calculatedCharges.length > 0 && <Separator />}

        {/* Taxes */}
        {renderChargeGroup('Taxes', grouped.taxes)}

        {/* Fees */}
        {renderChargeGroup('Fees', grouped.fees)}

        {/* Surcharges */}
        {renderChargeGroup('Surcharges', grouped.surcharges)}

        {/* Custom */}
        {renderChargeGroup('Other', grouped.custom)}

        {/* Deposits (Refundable) */}
        {renderChargeGroup('Refundable Deposits', grouped.deposits, true)}

        {calculatedCharges.length > 0 && (
          <>
            <Separator />
            
            {/* Total */}
            <div className="space-y-2">
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <FormattedPrice amount={grandTotal} className="text-lg" />
              </div>
              {totals.refundableTotal > 0 && (
                <p className="text-xs text-muted-foreground text-right">
                  Includes <FormattedPrice amount={totals.refundableTotal} className="inline" /> refundable
                </p>
              )}
            </div>
          </>
        )}

        {calculatedCharges.length === 0 && (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            No additional charges configured yet.
            <br />
            Add charges to see how they appear to guests.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
