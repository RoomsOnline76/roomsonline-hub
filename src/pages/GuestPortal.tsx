import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, MapPin, Users, CheckCircle, AlertTriangle, Shield } from "lucide-react";
import { SmartCancelModal } from "@/components/guest/SmartCancelModal";
import { format } from "date-fns";

interface BookingDetails {
  id: string;
  guest_name: string;
  guest_email_masked: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  total_price: number;
  rooms: any;
  special_requests: string | null;
  adults: number;
  children: number | null;
  infants: number | null;
  teens: number | null;
  payment_status: string | null;
  cancellation_reason: string | null;
}

interface PropertyInfo {
  name: string;
  slug: string;
  city: string;
  country: string;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  brand_font_color: string | null;
  brand_logo_url: string | null;
}

interface CancellationPolicy {
  is_free_cancel?: boolean;
  forfeit_amount?: number;
  forfeit_percent?: number;
  deadline_date?: string;
  is_non_refundable?: boolean;
}

const GuestPortal: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get("token");

  // Lookup state
  const [email, setEmail] = useState("");
  const [lastName, setLastName] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupSent, setLookupSent] = useState(false);

  // Token-validated state
  const [validating, setValidating] = useState(false);
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [property, setProperty] = useState<PropertyInfo | null>(null);
  const [cancellationPolicy, setCancellationPolicy] = useState<CancellationPolicy | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Cancel modal
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    if (tokenParam) {
      validateToken(tokenParam);
    }
  }, [tokenParam]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLookupLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("guest-portal-access", {
        body: {
          action: "request_access",
          email: email.trim().toLowerCase(),
          last_name: lastName.trim() || undefined,
        },
      });
      if (!error) setLookupSent(true);
    } catch (err) {
      console.error("Lookup error:", err);
    } finally {
      setLookupLoading(false);
    }
  };

  const validateToken = async (token: string) => {
    setValidating(true);
    setTokenError(null);

    try {
      const { data, error } = await supabase.functions.invoke("guest-portal-access", {
        body: { action: "validate_token", token },
      });

      if (error || !data?.success) {
        setTokenError(data?.error || "Invalid or expired link.");
        return;
      }

      setBooking(data.booking);
      setProperty(data.property);
      setCancellationPolicy(data.cancellation_policy);
    } catch (err) {
      setTokenError("Something went wrong. Please try again.");
    } finally {
      setValidating(false);
    }
  };

  const brandColor = property?.brand_primary_color || "hsl(var(--primary))";
  const nights = booking ? Math.ceil((new Date(booking.check_out_date).getTime() - new Date(booking.check_in_date).getTime()) / 86400000) : 0;
  const totalGuests = booking ? (booking.adults || 0) + (booking.teens || 0) + (booking.children || 0) + (booking.infants || 0) : 0;

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      confirmed: { label: "Confirmed", variant: "default" },
      pending: { label: "Pending", variant: "secondary" },
      checked_in: { label: "Checked In", variant: "default" },
      cancelled: { label: "Cancelled", variant: "destructive" },
    };
    const info = map[status] || { label: status, variant: "outline" as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  // Flow A: No token — lookup form
  if (!tokenParam) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-lg">Manage Your Booking</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your details and we'll send a secure link to your email
            </p>
          </CardHeader>
          <CardContent>
            {lookupSent ? (
              <div className="text-center space-y-3 py-4">
                <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  If we found matching bookings, a secure link has been sent to <strong>{email}</strong>.
                  Please check your inbox (and spam folder).
                </p>
                <Button variant="outline" size="sm" onClick={() => setLookupSent(false)}>
                  Try another email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleLookup} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName" className="text-xs">Last Name (optional)</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Your last name"
                    className="text-sm"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={lookupLoading || !email.trim()}>
                  {lookupLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Send Secure Link
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Validating token
  if (validating) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Token error
  if (tokenError) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-6 space-y-3">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">{tokenError}</p>
            <Button variant="outline" size="sm" onClick={() => window.location.href = "/my-booking"}>
              Request New Link
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Flow B: Booking details view
  if (!booking || !property) return null;

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Property header */}
        <div className="text-center space-y-2">
          {property.brand_logo_url && (
            <img src={property.brand_logo_url} alt={property.name} className="h-12 mx-auto object-contain" />
          )}
          <h1 className="text-lg font-semibold">{property.name}</h1>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <MapPin className="h-3 w-3" />
            {[property.city, property.country].filter(Boolean).join(", ")}
          </p>
        </div>

        {/* Booking card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Booking Details</CardTitle>
              {statusBadge(booking.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Guest</p>
                <p className="font-medium">{booking.guest_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reference</p>
                <p className="font-mono text-xs">{booking.id.substring(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2">
                <Calendar className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Check-in</p>
                  <p>{format(new Date(booking.check_in_date), "d MMM yyyy")}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Check-out</p>
                  <p>{format(new Date(booking.check_out_date), "d MMM yyyy")}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{totalGuests} guest{totalGuests !== 1 ? "s" : ""} · {nights} night{nights !== 1 ? "s" : ""}</span>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-semibold">R{booking.total_price.toLocaleString()}</p>
              </div>
            </div>

            {/* Rooms */}
            {booking.rooms && Array.isArray(booking.rooms) && booking.rooms.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                {booking.rooms.map((room: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span>{room.roomTypeName || `Room ${idx + 1}`}</span>
                    {room.status === "CANCELLED" && <Badge variant="destructive" className="text-[10px]">Cancelled</Badge>}
                  </div>
                ))}
              </div>
            )}

            {booking.special_requests && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">Special Requests</p>
                <p className="text-xs italic mt-1">{booking.special_requests}</p>
              </div>
            )}

            {booking.cancellation_reason && (
              <div className="bg-destructive/10 border border-destructive/20 rounded p-2 text-xs text-destructive">
                <strong>Cancellation Reason:</strong> {booking.cancellation_reason}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cancellation policy */}
        {cancellationPolicy && booking.status !== "cancelled" && (
          <Card>
            <CardContent className="pt-4 pb-3">
              {cancellationPolicy.is_non_refundable ? (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>This booking is <strong>non-refundable</strong>.</span>
                </div>
              ) : cancellationPolicy.is_free_cancel ? (
                <div className="flex items-start gap-2 text-xs text-emerald-600">
                  <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Free cancellation until <strong>{cancellationPolicy.deadline_date}</strong>
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-xs text-amber-600">
                  <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Cancellation fee: <strong>R{cancellationPolicy.forfeit_amount?.toFixed(2)}</strong> ({cancellationPolicy.forfeit_percent}%)
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        {booking.status !== "cancelled" && (
          <div className="flex gap-3">
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={() => setCancelOpen(true)}
            >
              Cancel Booking
            </Button>
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground">
          Powered by <a href="https://roomsonline.co.za" className="underline">RoomsOnline</a>
        </p>
      </div>

      {/* Smart cancel modal */}
      {booking && (
        <SmartCancelModal
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          booking={booking}
          property={property}
          cancellationPolicy={cancellationPolicy}
          token={tokenParam!}
          onCancelled={() => {
            setBooking({ ...booking, status: "cancelled" });
            setCancelOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default GuestPortal;
