import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingFolioTab } from "@/components/pms/BookingFolioTab";
import { format, parseISO, differenceInDays } from "date-fns";
import { CalendarDays, Mail, Phone, Users, CreditCard, Receipt, Info } from "lucide-react";
import type { CalendarBookingRow } from "./bookingCalendarHelpers";

interface Props {
  booking: CalendarBookingRow | null;
  onOpenChange: (open: boolean) => void;
}

export function BookingQuickViewSheet({ booking, onOpenChange }: Props) {
  const open = !!booking;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {booking && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {booking.guest_name}
                <Badge variant="outline" className="text-[10px] capitalize">
                  {booking.status.replace(/_/g, " ")}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                {format(parseISO(booking.check_in_date), "d MMM yyyy")}
                {" → "}
                {format(parseISO(booking.check_out_date), "d MMM yyyy")}
                {" · "}
                {differenceInDays(parseISO(booking.check_out_date), parseISO(booking.check_in_date))} nights
              </SheetDescription>
            </SheetHeader>

            <Tabs defaultValue="details" className="mt-4">
              <TabsList className="grid grid-cols-2 w-full h-8">
                <TabsTrigger value="details" className="text-xs">
                  <Info className="h-3 w-3 mr-1" />Details
                </TabsTrigger>
                <TabsTrigger value="charges" className="text-xs">
                  <Receipt className="h-3 w-3 mr-1" />Charges
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-3 space-y-3 text-sm">
                {booking.guest_email && (
                  <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{booking.guest_email}</div>
                )}
                {booking.guest_phone && (
                  <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{booking.guest_phone}</div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  {booking.adults ?? 0} adult{(booking.adults ?? 0) === 1 ? "" : "s"}
                  {(booking.children ?? 0) > 0 && `, ${booking.children} children`}
                  {(booking.teens ?? 0) > 0 && `, ${booking.teens} teens`}
                  {(booking.infants ?? 0) > 0 && `, ${booking.infants} infants`}
                  {(booking.pets ?? 0) > 0 && `, ${booking.pets} pets`}
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                  R{booking.total_price.toLocaleString()}
                  {booking.payment_status && (
                    <Badge variant="secondary" className="text-[10px] capitalize ml-1">{booking.payment_status}</Badge>
                  )}
                </div>
                {booking.special_requests && (
                  <div className="rounded-md border bg-muted/30 p-2 text-xs">
                    <p className="font-medium mb-1">Special requests</p>
                    <p className="text-muted-foreground whitespace-pre-wrap">{booking.special_requests}</p>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground pt-2 border-t">
                  Use the Charges tab to add extras (mini-bar, late checkout, damages) — they will be billed at checkout.
                </p>
              </TabsContent>

              <TabsContent value="charges" className="mt-3">
                <BookingFolioTab bookingId={booking.id} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
