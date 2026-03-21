import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { motion } from "framer-motion";

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
          <Input
            id="fluent-voucher"
            value={voucher}
            onChange={(e) => onVoucherChange(e.target.value)}
            placeholder="Enter promo code"
            className="h-10"
          />
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
