import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronRight, Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { motion } from "framer-motion";

export type VoucherStatus = "idle" | "loading" | "valid" | "invalid";

export interface VoucherResult {
  discount_type: "percentage" | "fixed";
  discount_value: number;
  discount_amount: number;
  conditions: Record<string, any>;
  description?: string;
  reason?: string;
}

interface FluentGuestFormProps {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  specialRequests?: string;
  voucher?: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onSpecialRequestsChange?: (v: string) => void;
  onVoucherChange?: (v: string) => void;
  onBlur?: () => void;
  errors?: Record<string, string>;
  showVoucher?: boolean;
  className?: string;
  // Voucher validation props
  voucherStatus?: VoucherStatus;
  voucherResult?: VoucherResult | null;
  onApplyVoucher?: () => void;
}

/**
 * Shared Fluent-styled guest details form.
 * Used by Booking.tsx and InlineCheckoutPanel.
 */
export function FluentGuestForm({
  guestName,
  guestEmail,
  guestPhone,
  specialRequests = "",
  voucher = "",
  onNameChange,
  onEmailChange,
  onPhoneChange,
  onSpecialRequestsChange,
  onVoucherChange,
  onBlur,
  errors = {},
  showVoucher = false,
  className,
  voucherStatus = "idle",
  voucherResult,
  onApplyVoucher,
}: FluentGuestFormProps) {
  const [specialOpen, setSpecialOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className={cn("space-y-3", className)}
    >
      <div>
        <Label htmlFor="fluent-name" className="text-xs">Full Name *</Label>
        <Input
          id="fluent-name"
          value={guestName}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={onBlur}
          placeholder="John Smith"
          className={cn("h-10", errors.name && "border-destructive")}
        />
        {errors.name && <p className="text-xs text-destructive mt-0.5">{errors.name}</p>}
      </div>
      <div>
        <Label htmlFor="fluent-email" className="text-xs">Email *</Label>
        <Input
          id="fluent-email"
          type="email"
          value={guestEmail}
          onChange={(e) => onEmailChange(e.target.value)}
          onBlur={onBlur}
          placeholder="john@example.com"
          className={cn("h-10", errors.email && "border-destructive")}
        />
        {errors.email && <p className="text-xs text-destructive mt-0.5">{errors.email}</p>}
      </div>
      <div>
        <Label htmlFor="fluent-phone" className="text-xs">Phone *</Label>
        <Input
          id="fluent-phone"
          type="tel"
          value={guestPhone}
          onChange={(e) => onPhoneChange(e.target.value)}
          onBlur={onBlur}
          placeholder="+27 82 123 4567"
          className={cn("h-10", errors.phone && "border-destructive")}
        />
        {errors.phone && <p className="text-xs text-destructive mt-0.5">{errors.phone}</p>}
      </div>

      {showVoucher && onVoucherChange && (
        <div>
          <Label htmlFor="fluent-voucher" className="text-xs">Voucher Code</Label>
          <div className="flex gap-2">
            <Input
              id="fluent-voucher"
              value={voucher}
              onChange={(e) => {
                onVoucherChange(e.target.value);
              }}
              placeholder="Enter promo code"
              className={cn(
                "h-10 flex-1",
                voucherStatus === "valid" && "border-green-500",
                voucherStatus === "invalid" && "border-destructive"
              )}
            />
            {onApplyVoucher && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 px-4"
                disabled={!voucher?.trim() || voucherStatus === "loading"}
                onClick={onApplyVoucher}
              >
                {voucherStatus === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Apply"
                )}
              </Button>
            )}
          </div>

          {/* Voucher validation result */}
          {voucherStatus === "valid" && voucherResult && (
            <div className="mt-1.5 flex items-start gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
              <div className="text-xs">
                <span className="text-green-600 font-medium">
                  {voucherResult.discount_type === "percentage"
                    ? `${voucherResult.discount_value}% discount applied`
                    : `R ${voucherResult.discount_value} discount applied`}
                </span>
                {voucherResult.description && (
                  <span className="text-muted-foreground ml-1">— {voucherResult.description}</span>
                )}
                {voucherResult.conditions?.non_refundable && (
                  <div className="mt-1 flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="font-medium">Non-refundable booking</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {voucherStatus === "invalid" && voucherResult && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
              <span className="text-xs text-destructive">{voucherResult.reason || "Invalid voucher code"}</span>
            </div>
          )}
        </div>
      )}

      {onSpecialRequestsChange && (
        <Collapsible open={specialOpen} onOpenChange={setSpecialOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className={cn("h-3 w-3 transition-transform", specialOpen && "rotate-90")} />
            <span>Special requests</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <Textarea
              value={specialRequests}
              onChange={(e) => onSpecialRequestsChange(e.target.value)}
              placeholder="Dietary needs, accessibility, celebrations..."
              rows={2}
              className="text-sm"
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </motion.div>
  );
}
