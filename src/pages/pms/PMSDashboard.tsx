import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from "react";
import { syncRolosRoomTypesFromOverview } from "@/lib/pmsRoomTypeSync";
import { autoAssignBookings } from "@/lib/bookingAssignment";

import { GuestCheckInDialog } from "@/components/pms/crm/GuestCheckInDialog";
import { ManualBookingDialog } from "@/components/pms/ManualBookingDialog";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, startOfWeek, endOfWeek, differenceInDays, isToday, parseISO, getDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBlockedTooltip, type BlockDetail } from "@/lib/blockAttribution";
import { usePMSBrand } from "@/contexts/PMSBrandContext";
import { BulkStopSellDialog } from "@/components/BulkStopSellDialog";
import { RestrictionsManagerDialog } from "@/components/restrictions/RestrictionsManagerDialog";
import { invalidateRestrictionQueries } from "@/lib/restrictionRefresh";
import { BulkMinimumStayDialog } from "@/components/BulkMinimumStayDialog";
import { BulkMaximumStayDialog } from "@/components/BulkMaximumStayDialog";
import { BulkLeadDaysAdvanceDialog } from "@/components/BulkLeadDaysAdvanceDialog";
import { BulkLeadDaysPostDialog } from "@/components/BulkLeadDaysPostDialog";
import { BookingFolioTab } from "@/components/pms/BookingFolioTab";
import { BookingDetailsGrid, type BookingDetailsGridBooking } from "@/components/pms/booking/BookingDetailsGrid";

import { CheckoutConfirmationDialog } from "@/components/pms/CheckoutConfirmationDialog";
import { BookingCancelDialog } from "@/components/pms/BookingCancelDialog";
import { BookingModifyDialog } from "@/components/pms/BookingModifyDialog";
import { BookingInvoice } from "@/components/pms/BookingInvoice";
import { AccountSummaryPanel } from "@/components/pms/booking/AccountSummaryPanel";
import { BookingNotesTab } from "@/components/pms/BookingNotesTab";
import { RoomPlanGrid, type RoomPlanCreatePayload, type RoomPlanMovePayload, type RoomPlanGroupBlock } from "@/components/pms/roomplan/RoomPlanGrid";
import type { RoomPlanBooking } from "@/components/pms/roomplan/RoomPlanBar";
import { extractFunctionError } from "@/lib/functionError";
import { queueChannelRatesSync } from "@/lib/channelContentSync";
import { pushBookingToChannel } from "@/lib/channelBookingSync";

import { useBookingCoverage } from "@/lib/bookingHistoryWindow";

import { CHANNEL_SOURCE_BADGE, channelSourceLabel } from "@/lib/channelVocabulary";
import { resolveRuSourceChannel, ChannelLogo } from "@/lib/ruChannelDisplay";
import { useIsMobile } from "@/hooks/use-mobile";


import { callPmsApi } from "@/hooks/usePmsApi";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CalendarDays,
  AlertTriangle,
  MessageSquare,
  User,
  Mail,
  Phone,
  CreditCard,
  Globe,
  Clock,
  BedDouble,
  Baby,
  PawPrint,
  Ban,
  Building2,
  Users,
  CalendarCheck,
  Sparkles,
  Settings2,
  TrendingUp,
  Plus,
  Pencil,
  LogIn,
  LogOut,
  XCircle,
  EyeOff,
  CheckCircle,
  FileText,
  Receipt,
  MessageSquareText,
  Loader2,
  Info,

} from "lucide-react";
import { rebuildGuestStats } from "@/lib/guestIdentity";
import { toast } from "sonner";
import { useRealtimeBookings } from "@/hooks/useRealtimeBookings";
import { useBookingRoomLines } from "@/hooks/useBookingRoomLines";

import { displayBookingReference } from "@/lib/bookingReference";

// ──────────── SA Public Holidays ────────────
const SA_PUBLIC_HOLIDAYS: { [year: number]: { [date: string]: string } } = {
  2025: {
    "2025-01-01": "New Year's Day", "2025-03-21": "Human Rights Day", "2025-04-18": "Good Friday",
    "2025-04-21": "Family Day", "2025-04-28": "Freedom Day (Observed)", "2025-05-01": "Workers' Day",
    "2025-06-16": "Youth Day", "2025-08-09": "National Women's Day", "2025-09-24": "Heritage Day",
    "2025-12-16": "Day of Reconciliation", "2025-12-25": "Christmas Day", "2025-12-26": "Day of Goodwill",
  },
  2026: {
    "2026-01-01": "New Year's Day", "2026-03-21": "Human Rights Day", "2026-04-03": "Good Friday",
    "2026-04-06": "Family Day", "2026-04-27": "Freedom Day", "2026-05-01": "Workers' Day",
    "2026-06-16": "Youth Day", "2026-08-10": "National Women's Day (Observed)", "2026-09-24": "Heritage Day",
    "2026-12-16": "Day of Reconciliation", "2026-12-25": "Christmas Day", "2026-12-26": "Day of Goodwill",
  },
  2027: {
    "2027-01-01": "New Year's Day", "2027-03-22": "Human Rights Day (Observed)", "2027-03-26": "Good Friday",
    "2027-03-29": "Family Day", "2027-04-27": "Freedom Day", "2027-05-01": "Workers' Day",
    "2027-06-16": "Youth Day", "2027-08-09": "National Women's Day", "2027-09-24": "Heritage Day",
    "2027-12-16": "Day of Reconciliation", "2027-12-25": "Christmas Day", "2027-12-27": "Day of Goodwill (Observed)",
  },
};
function getHolidayName(date: Date): string | null {
  const dateStr = format(date, "yyyy-MM-dd");
  return SA_PUBLIC_HOLIDAYS[date.getFullYear()]?.[dateStr] || null;
}
function isWeekendDay(date: Date): boolean {
  const day = getDay(date);
  return day === 0 || day === 6;
}

type ViewMode = "roomplan" | "week" | "month";
type DashboardPanel = "arrivals" | "departures" | "recent" | null;

type BookingDetailTab = "details" | "folio" | "invoice" | "notes";

interface BookingRow {
  id: string;
  /** Concurrency stamp so a save cannot undo a newer channel modification. */
  updated_at?: string | null;

  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  check_in_date: string;
  check_out_date: string;
  status: string;
  adults: number;
  children: number | null;
  infants: number | null;
  pets: number | null;
  teens: number | null;
  total_price: number;
  special_requests: string | null;
  special_requests_parsed: Record<string, unknown> | null;
  requires_intervention: boolean | null;
  booking_channel: string | null;
  payment_status: string | null;
  payment_method: string | null;
  rolos_check_in_time: string | null;
  rolos_check_out_time: string | null;
  rolos_room_ids: string[] | null;
  rolos_rate_plan_id: string | null;
  modification_notes: Record<string, unknown>[] | null;
  room_type_id: string | null;
  /** Room types of the booking's per-unit lines (multi-room stays). */
  line_room_type_ids?: string[] | null;
  rol_reference?: string | null;
  external_reservation_id?: string | null;
  rolos_guest_id: string | null;
  property_id: string | null;
  /** e.g. 'rentalsunited_lead' for a channel enquiry holding the dates. */
  integration_type?: string | null;
  /** Set once a lead's 3-day hold has lapsed and the nights were released. */
  hold_released_at?: string | null;
  hold_expires_at?: string | null;
}


interface RoomType {
  id: string;
  name: string;
  default_rate: number | null;
  is_active: boolean | null;
  max_occupancy: number | null;
  property_type: string | null;
  linked_overview_id?: string | null;
}

interface Room {
  id: string;
  room_number: string;
  room_name: string | null;
  room_type_id: string | null;
  status: string;
  property_id?: string | null;
}

interface RateSeason {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_peak: boolean | null;
  rate_plan_id: string;
  min_stay_override: number | null;
}

interface RatePrice {
  id: string;
  base_rate: number;
  room_type_id: string;
  season_id: string;
}

interface AvailabilityOverride {
  room_type: string;
  date: string;
  is_stop_sell: boolean | null;
  minimum_stay: number | null;
  maximum_stay: number | null;
  lead_days_advance: number | null;
  lead_days_post: number | null;
  available_units: number | null;
  blocked_by_label?: string | null;
  blocked_reason?: string | null;
  blocked_at?: string | null;
  external_system?: string | null;
}

const normalizeRoomTypeName = (value: string | null | undefined) => value?.trim().toLowerCase() || "";

/**
 * A night closed by a channel reservation carries that booking's stamp. The stay is already drawn
 * as its own booking bar, so painting the same night as a block too showed the odd hatching that
 * appeared to sit next to (or on top of) channel bookings. Only operator/manual blocks are drawn.
 */
const isChannelBookingBlock = (o: AvailabilityOverride | undefined | null): boolean =>
  !!o?.blocked_reason && String(o.blocked_reason).startsWith("channel_booking:");

/** Single source of truth for "this night is blocked" — stop-sell flag OR zero units.
 * Room plan, week and month grids all read this so they cannot drift apart. */
const isBlockedOverride = (o: AvailabilityOverride | undefined | null): boolean =>
  !!o && (o.is_stop_sell === true || o.available_units === 0) && !isChannelBookingBlock(o);

const blockDetailOf = (o: AvailabilityOverride | undefined | null): BlockDetail => ({
  label: o?.blocked_by_label ?? null,
  at: o?.blocked_at ?? null,
  reason: o?.blocked_reason ?? null,
  source: o?.external_system ?? null,
});

function normalizeRoomsToCanonicalRoomTypes<T extends Room>(
  rawRooms: T[],
  rawRoomTypes: Array<Pick<RoomType, "id" | "name">>,
  canonicalRoomTypes: Array<Pick<RoomType, "id" | "name">>,
): T[] {
  if (canonicalRoomTypes.length === 0) return rawRooms;

  const canonicalTypeIds = new Set(canonicalRoomTypes.map((roomType) => roomType.id));
  const canonicalIdByName = new Map(
    canonicalRoomTypes
      .map((roomType) => [normalizeRoomTypeName(roomType.name), roomType.id] as const)
      .filter(([name]) => Boolean(name)),
  );
  const rawTypeNameById = new Map(rawRoomTypes.map((roomType) => [roomType.id, normalizeRoomTypeName(roomType.name)]));

  return rawRooms.flatMap((room) => {
    if (!room.room_type_id || canonicalTypeIds.has(room.room_type_id)) return [room];

    const legacyTypeName = rawTypeNameById.get(room.room_type_id)
      || normalizeRoomTypeName(room.room_name)
      || normalizeRoomTypeName(room.room_number);
    const canonicalTypeId = legacyTypeName ? canonicalIdByName.get(legacyTypeName) : undefined;

    return canonicalTypeId ? [{ ...room, room_type_id: canonicalTypeId }] : [];
  });
}

/**
 * Channel-imported bookings (Rentals United, public booking engine) carry a foreign
 * room-type id (`hostfully_room_types`). Rewrite it to the canonical `rolos_room_types`
 * id with the same name so every calendar row matcher can see them.
 */
function remapBookingsToCanonicalRoomTypes<T extends { room_type_id?: string | null }>(
  bookingList: T[],
  foreignRoomTypes: Array<{ id: string; name: string | null }>,
  canonicalRoomTypes: Array<Pick<RoomType, "id" | "name" | "linked_overview_id">>,
): T[] {
  if (!bookingList.length || canonicalRoomTypes.length === 0) return bookingList;

  const canonicalIds = new Set(canonicalRoomTypes.map((rt) => rt.id));
  const canonicalIdByName = new Map(
    canonicalRoomTypes
      .map((rt) => [normalizeRoomTypeName(rt.name), rt.id] as const)
      .filter(([name]) => Boolean(name)),
  );
  const canonicalIdByOverview = new Map(
    canonicalRoomTypes
      .filter((rt) => rt.linked_overview_id)
      .map((rt) => [rt.linked_overview_id as string, rt.id] as const),
  );
  const foreignNameById = new Map(foreignRoomTypes.map((rt) => [rt.id, normalizeRoomTypeName(rt.name)]));

  return bookingList.map((booking) => {
    const typeId = booking.room_type_id;
    if (!typeId || canonicalIds.has(typeId)) return booking;

    const viaOverview = canonicalIdByOverview.get(typeId);
    const foreignName = foreignNameById.get(typeId);
    const canonicalId = viaOverview || (foreignName ? canonicalIdByName.get(foreignName) : undefined);
    return canonicalId ? { ...booking, room_type_id: canonicalId } : booking;
  });
}

/** Hold / auto-withdrawal summary for a channel enquiry (blank for normal bookings). */
function getHoldSummary(
  booking: Pick<BookingRow, "status" | "integration_type" | "hold_expires_at" | "hold_released_at" | "check_in_date">,
): { label: string; detail: string } | null {
  if (!isChannelLead(booking) || booking.status !== "pending") return null;

  const withdrawalDue = format(addDays(parseISO(booking.check_in_date), -14), "d MMM yyyy");

  if (booking.hold_released_at) {
    return {
      label: "Hold expired",
      detail: `Dates released ${format(parseISO(booking.hold_released_at), "d MMM HH:mm")} · auto-withdrawn from ${withdrawalDue}`,
    };
  }
  if (!booking.hold_expires_at) {
    return { label: "Enquiry", detail: `Auto-withdrawal from ${withdrawalDue}` };
  }

  const expires = parseISO(booking.hold_expires_at);
  const hoursLeft = Math.round((expires.getTime() - Date.now()) / 3_600_000);
  const remaining = hoursLeft <= 0
    ? "hold lapsed"
    : hoursLeft < 24
      ? `${hoursLeft}h left`
      : `${Math.floor(hoursLeft / 24)}d ${hoursLeft % 24}h left`;

  return {
    label: `Hold ${remaining}`,
    detail: `Hold expires ${format(expires, "d MMM HH:mm")} · auto-withdrawal from ${withdrawalDue}`,
  };
}

/** Native title text for a calendar bar, including hold countdowns for enquiries. */
function getBookingBarTitle(booking: BookingRow): string {
  const hold = getHoldSummary(booking);
  const base = `${booking.guest_name} · ${booking.check_in_date} → ${booking.check_out_date}`;
  return hold ? `${base}\n${hold.label} — ${hold.detail}` : base;
}

/**
 * Which day cell prints the guest name.
 *
 * Bars are drawn cell by cell, and the arrival cell only owns the right half of its width (the
 * half-day wedge), so a name printed there is cut to a couple of characters. The label therefore
 * moves to the first full night. Two edge cases matter for staff scanning the board: a one-night
 * stay has no full night, so it keeps the label on its arrival cell, and a stay that began before
 * the visible range labels its first visible night instead — otherwise it would show as an
 * anonymous coloured band.
 */
function getBookingLabelDate(booking: BookingRow, visibleDates: Date[]): string {
  const firstFullNight = format(addDays(parseISO(booking.check_in_date), 1), "yyyy-MM-dd");
  const lastNight = format(addDays(parseISO(booking.check_out_date), -1), "yyyy-MM-dd");
  // Single-night stay: the arrival cell is the only cell there is.
  if (firstFullNight > lastNight) return booking.check_in_date;

  const windowStart = visibleDates.length ? format(visibleDates[0], "yyyy-MM-dd") : null;
  if (windowStart && windowStart > firstFullNight) {
    // Stay already in progress (or arrival scrolled off): label the first night in view.
    return windowStart > lastNight ? lastNight : windowStart;
  }
  return firstFullNight;
}

/**
 * The guest name overlay for a booking bar.
 *
 * Bars are clipped to their own day cell, which is far narrower than most names. This overlay sits
 * on top of the bar and is deliberately unclipped, so the name runs on across the following nights
 * of the same stay and stays readable at a glance.
 */
function BookingBarLabel({ booking, textClass, halfStart }: { booking: BookingRow; textClass: string; halfStart?: boolean }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-y-0.5 z-[2] flex items-center gap-1 px-1 whitespace-nowrap",
        halfStart ? "left-1/2" : "left-0",
      )}
    >
      <span className={cn("text-[9px] font-medium leading-none", textClass)}>{booking.guest_name}</span>
      {hasSpecialIndicator(booking) && <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-amber-500" />}
    </span>
  );
}




const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  confirmed: { bg: "bg-blue-500/20", text: "text-info dark:text-blue-300", border: "border-blue-500/40" },
  pending: { bg: "bg-amber-500/20", text: "text-warning dark:text-amber-300", border: "border-amber-500/40" },
  checked_in: { bg: "bg-green-500/20", text: "text-success dark:text-green-300", border: "border-green-500/40" },
  checked_out: { bg: "bg-slate-500/20", text: "text-foreground/80 dark:text-slate-300", border: "border-slate-500/40" },
  cancelled: { bg: "bg-red-500/20", text: "text-destructive dark:text-red-300 line-through", border: "border-red-500/40" },
  no_show: { bg: "bg-rose-500/20", text: "text-destructive dark:text-rose-300", border: "border-rose-500/40" },
  /** Channel enquiry (e.g. Rentals United lead) holding the dates for 3 days. */
  lead_held: { bg: "bg-violet-500/20", text: "text-primary dark:text-violet-300", border: "border-violet-500/40 border-dashed" },
  /** Enquiry whose hold has lapsed — still visible, no longer blocking. */
  lead_released: { bg: "bg-muted", text: "text-muted-foreground italic", border: "border-border border-dotted" },
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "default",
  pending: "secondary",
  waiting_for_deposit: "secondary",
  checked_in: "default",
  checked_out: "outline",
  cancelled: "destructive",
  no_show: "destructive",
};


function getStatusColor(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.pending;
}

/** True for a channel enquiry pulled from a channel manager (not yet a confirmed booking). */
function isChannelLead(booking: Pick<BookingRow, "integration_type">): boolean {
  return (booking.integration_type ?? "").endsWith("_lead");
}

/** Rentals United bookings must be cancelled / modified at the channel first. */
function isRuSourcedBooking(booking: Pick<BookingRow, "booking_channel" | "integration_type">): boolean {
  return (
    (booking.booking_channel || "").toLowerCase() === "rentals_united" ||
    (booking.integration_type || "").toLowerCase().startsWith("rentalsunited")
  );
}

/** Unconfirmed RU requests are rejected rather than cancelled. */
function isRuLeadOrigin(booking: Pick<BookingRow, "integration_type">): boolean {
  return (booking.integration_type || "").toLowerCase() === "rentalsunited_lead";
}



/** Colour a calendar bar: enquiries read as held (dashed) or lapsed (muted). */
function getBookingColor(booking: Pick<BookingRow, "status" | "integration_type" | "hold_released_at">) {
  if (isChannelLead(booking) && booking.status === "pending") {
    return booking.hold_released_at ? STATUS_COLORS.lead_released : STATUS_COLORS.lead_held;
  }
  return getStatusColor(booking.status);
}

function bookingTouchesDate(booking: Pick<BookingRow, "check_in_date" | "check_out_date" | "status">, dateStr: string): boolean {
  return dateStr >= booking.check_in_date
    && dateStr < booking.check_out_date
    && !["cancelled", "no_show"].includes(booking.status);
}

function bookingMatchesRoomType(booking: BookingRow, roomType: RoomType, typeRooms: Room[]): boolean {
  if (booking.room_type_id && (booking.room_type_id === roomType.id || booking.room_type_id === roomType.linked_overview_id)) return true;
  if (booking.rolos_room_ids?.some((roomId) => typeRooms.some((room) => room.id === roomId))) return true;
  // Unassigned bookings can't be tied to a type — never hide them.
  if (!booking.room_type_id && !(booking.rolos_room_ids?.length)) return true;
  return false;
}

/** Restrict a candidate date range + room types to what a property actually has booked. */
function filterToBookedView(
  candidateDates: Date[],
  bookingList: BookingRow[],
  roomTypeList: RoomType[],
  roomsByTypeMap: Map<string, Room[]>,
): { visibleDates: Date[]; visibleRoomTypes: RoomType[] } {
  const liveBookings = bookingList.filter((booking) => !["cancelled", "no_show"].includes(booking.status));
  const visibleDates = candidateDates.filter((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return liveBookings.some((booking) => bookingTouchesDate(booking, dateStr));
  });
  const dateKeys = visibleDates.map((date) => format(date, "yyyy-MM-dd"));
  const activeBookings = liveBookings.filter((booking) => dateKeys.some((dateKey) => bookingTouchesDate(booking, dateKey)));
  const visibleRoomTypes = roomTypeList.filter((roomType) =>
    activeBookings.some((booking) => bookingMatchesRoomType(booking, roomType, roomsByTypeMap.get(roomType.id) || []))
  );
  return { visibleDates, visibleRoomTypes };
}



export default function PMSDashboard() {
  const { propertyId, properties, portfolioProperties, portfolioName, loading: propLoading, switchProperty, showPortfolioToggle } = usePmsPropertyId();
  // If selected property is in a portfolio, scope dropdown to portfolio members
  const displayProperties = portfolioProperties || properties;
  const { propertyName: brandName } = usePMSBrand();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<ViewMode>("roomplan");
  const [legendOpen, setLegendOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<DashboardPanel>(null);
  const [roomPlanPrefill, setRoomPlanPrefill] = useState<{
    propertyId?: string | null;
    roomTypeId?: string | null;
    roomId?: string | null;
    checkIn?: Date | null;
    checkOut?: Date | null;
  } | null>(null);
  const [modifyTarget, setModifyTarget] = useState<BookingRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  // Set when Cancel was pressed on one bar of a multi-unit stay.
  const [cancelUnit, setCancelUnit] = useState<{ lineId: string; roomLabel: string; unitCount: number } | null>(null);
  // Room Plan drag interactions are pointer-based — mobile keeps the stacked grid.
  useEffect(() => {
    if (isMobile) setViewMode((current) => (current === "roomplan" ? "month" : current));
  }, [isMobile]);

  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null);
  const [bookingSheetTab, setBookingSheetTab] = useState<BookingDetailTab>("details");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Restriction dialogs
  const [stopSellOpen, setStopSellOpen] = useState(false);
  const [manageRestrictionsOpen, setManageRestrictionsOpen] = useState(false);
  const [focusBlock, setFocusBlock] = useState<{ propertyId: string; roomType: string; date: string } | null>(null);
  const [minStayOpen, setMinStayOpen] = useState(false);
  const [maxStayOpen, setMaxStayOpen] = useState(false);
  const [leadDaysAdvanceOpen, setLeadDaysAdvanceOpen] = useState(false);
  const [leadDaysPostOpen, setLeadDaysPostOpen] = useState(false);
  const [manualBookingOpen, setManualBookingOpen] = useState(false);
  const [checkInBookingId, setCheckInBookingId] = useState<string | null>(null);
  const [dashboardView, setDashboardView] = useState<"single" | "portfolio">("single");
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(() => new Set());
  const [showOnlyBookedDays, setShowOnlyBookedDays] = useState(false);
  const [autoDefaultedView, setAutoDefaultedView] = useState(false);
  const [quickAction, setQuickAction] = useState<{ bookingId: string; action: "check_in" | "check_out" } | null>(null);
  // Default to portfolio view when a portfolio (>1 properties) exists
  useEffect(() => {
    if (!autoDefaultedView && (portfolioProperties?.length || 0) > 1) {
      setDashboardView("portfolio");
      setAutoDefaultedView(true);
    }
  }, [portfolioProperties, autoDefaultedView]);
  const portfolioPropertyIds = useMemo(() => portfolioProperties?.map(p => p.id) || [], [portfolioProperties]);
  const isPortfolioMode = dashboardView === "portfolio" && portfolioPropertyIds.length > 1;

  // Compute date range
  const dateRange = useMemo(() => {
    if (viewMode === "week") {
      const start = startOfWeek(anchorDate, { weekStartsOn: 1 });
      const end = endOfWeek(anchorDate, { weekStartsOn: 1 });
      return { start, end };
    }
    // Month view: start from anchorDate, show 30 days
    const start = anchorDate;
    const end = addDays(anchorDate, 30);
    return { start, end };
  }, [anchorDate, viewMode]);

  const dates = useMemo(() => {
    const days: Date[] = [];
    let d = dateRange.start;
    while (d <= dateRange.end) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days;
  }, [dateRange]);

  // For month view, chunk dates into weeks of 7 days
  const weekChunks = useMemo(() => {
    if (viewMode === "week") return [dates];
    const chunks: Date[][] = [];
    for (let i = 0; i < dates.length; i += 7) {
      chunks.push(dates.slice(i, i + 7));
    }
    return chunks;
  }, [dates, viewMode]);

  // Fetch property name + amenities for season rate fallback
  const { data: propertyData } = useQuery({
    queryKey: ["pms-prop-name", propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const { data } = await supabase.from("properties").select("name, amenities, is_rol_property").eq("id", propertyId).single();
      return data;
    },
    enabled: !!propertyId,
  });

  // Fetch room types (with linked overview data for unit counts)
  const { data: roomTypes = [] } = useQuery({
    queryKey: ["pms-cal-room-types", propertyId, (propertyData as any)?.amenities?.room_types],
    queryFn: async () => {
      if (!propertyId) return [];
      // Sync room types from overview on load (reactivates deactivated types)
      try { await syncRolosRoomTypesFromOverview(propertyId); } catch (e) { console.warn("[PMSDashboard] sync error:", e); }
      const { data } = await supabase
        .from("rolos_room_types")
        .select("id, name, default_rate, is_active, max_occupancy, linked_overview_id")
        .eq("property_id", propertyId)
        .eq("is_active", true)
        .order("name");

      // Fetch overview room types for unit/property_type info
      const { data: overviewData } = await supabase
        .from("hostfully_room_types")
        .select("id, property_type, max_guests")
        .eq("property_id", propertyId)
        .eq("is_active", true);

      const overviewMap = new Map((overviewData || []).map(o => [o.id, o]));
      const rawRoomTypes = (data || []).map(rt => {
        const overview = overviewMap.get((rt as any).linked_overview_id);
        return {
          ...rt,
          linked_overview_id: (rt as any).linked_overview_id || null,
          property_type: overview?.property_type || null,
        } as RoomType;
      });

      const canonicalAmenityNames = new Set(
        (((propertyData as any)?.is_rol_property ? (propertyData as any)?.amenities?.room_types : []) || [])
          .map((roomType: any) => String(roomType?.name || "").trim().toLowerCase())
          .filter(Boolean)
      );

      if (canonicalAmenityNames.size === 0) return rawRoomTypes;

      const deduped = new Map<string, RoomType>();
      for (const roomType of rawRoomTypes) {
        const normalizedName = roomType.name.trim().toLowerCase();
        if (!canonicalAmenityNames.has(normalizedName)) continue;

        const existing = deduped.get(normalizedName);
        if (!existing) {
          deduped.set(normalizedName, roomType);
          continue;
        }

        const existingScore = Number(Boolean(existing.linked_overview_id)) * 10 + Number(existing.default_rate ?? 0);
        const nextScore = Number(Boolean(roomType.linked_overview_id)) * 10 + Number(roomType.default_rate ?? 0);
        if (nextScore > existingScore) {
          deduped.set(normalizedName, roomType);
        }
      }

      return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!propertyId,
  });

  const { data: roomTypeNamesForRooms = [] } = useQuery({
    queryKey: ["pms-cal-room-type-names", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("rolos_room_types")
        .select("id, name")
        .eq("property_id", propertyId);
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Foreign room-type catalogue (public/overview listing). Bookings created from the
  // public booking engine carry a hostfully_room_types id, which must still resolve to
  // a physical ROL'OS unit — otherwise the booking lands in the UNASSIGNED lane.
  const { data: aliasRoomTypes = [] } = useQuery({
    queryKey: ["pms-cal-alias-room-types", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("hostfully_room_types")
        .select("id, name")
        .eq("property_id", propertyId);
      return (data || []).map((t) => ({ id: t.id, name: t.name || "", property_id: propertyId }));
    },
    enabled: !!propertyId,
  });


  // Fetch rooms
  const { data: rooms = [] } = useQuery({
    queryKey: ["pms-cal-rooms", propertyId, roomTypes.map(t => t.id).join(","), roomTypeNamesForRooms.map(t => t.id).join(",")],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("rolos_rooms")
        .select("id, room_number, room_name, room_type_id, status")
        .eq("property_id", propertyId)
        .order("room_number");
      const raw = (data || []) as Room[];
      return normalizeRoomsToCanonicalRoomTypes(raw, roomTypeNamesForRooms, roomTypes);
    },
    enabled: !!propertyId,
  });

  // Held group inventory in range — drawn as hatching on the Room Plan type rows
  // so staff can see rooms that are committed to a group but not yet picked up.
  const { data: groupBlocks = [] } = useQuery({
    queryKey: ["pms-cal-group-blocks", propertyId, format(dateRange.start, "yyyy-MM-dd"), format(dateRange.end, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!propertyId) return [] as RoomPlanGroupBlock[];
      const { data } = await supabase
        .from("rolos_group_room_blocks")
        .select("id, room_type_id, start_date, end_date, blocked_count, picked_up_count, status, group:rolos_groups!group_id(name)")
        .eq("property_id", propertyId)
        .eq("status", "blocked")
        .lt("start_date", format(dateRange.end, "yyyy-MM-dd"))
        .gt("end_date", format(dateRange.start, "yyyy-MM-dd"));
      return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        group_name: (row.group as { name?: string } | null)?.name ?? null,
        room_type_id: String(row.room_type_id),
        start_date: String(row.start_date),
        end_date: String(row.end_date),
        blocked_count: Number(row.blocked_count || 0),
        picked_up_count: Number(row.picked_up_count || 0),
      })) as RoomPlanGroupBlock[];
    },
    enabled: !!propertyId,
  });


  // Fetch bookings in range with pagination guard (auto-fetch all pages)
  const BOOKINGS_PAGE_SIZE = 500;
  const bookingsInfinite = useInfiniteQuery({
    queryKey: ["pms-cal-bookings", propertyId, format(dateRange.start, "yyyy-MM-dd"), format(dateRange.end, "yyyy-MM-dd")],
    queryFn: async ({ pageParam = 0 }) => {
      if (!propertyId) return { items: [] as BookingRow[], nextOffset: null as number | null };
      const { data, count } = await supabase
        .from("bookings")
        .select("id, updated_at, guest_name, guest_email, guest_phone, check_in_date, check_out_date, status, adults, children, infants, pets, teens, total_price, special_requests, special_requests_parsed, requires_intervention, rol_reference, external_reservation_id, booking_channel, payment_status, payment_method, rolos_check_in_time, rolos_check_out_time, rolos_room_ids, rolos_rate_plan_id, modification_notes, room_type_id, rolos_guest_id, property_id, integration_type, hold_expires_at, hold_released_at, booker_is_guest, booker_name, booker_email, booker_phone, company_account_id, agent_account_id, source_account_id, market_segment, comm_channel, invoice_to_name, invoice_to_vat, invoice_to_address, guest_company, second_guest_name, booking_made_by, internal_notes, deposit_amount, payment_reference, created_at", { count: "exact" })
        .eq("property_id", propertyId)
        .neq("status", "cancelled")
        .lte("check_in_date", format(dateRange.end, "yyyy-MM-dd"))
        .gte("check_out_date", format(dateRange.start, "yyyy-MM-dd"))
        .range(pageParam, pageParam + BOOKINGS_PAGE_SIZE - 1);
      const total = count || 0;
      return {
        items: (data || []) as BookingRow[],
        nextOffset: pageParam + BOOKINGS_PAGE_SIZE < total ? pageParam + BOOKINGS_PAGE_SIZE : null,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: !!propertyId,
  });

  // Auto-fetch all pages for calendar completeness
  useEffect(() => {
    if (bookingsInfinite.hasNextPage && !bookingsInfinite.isFetchingNextPage) {
      bookingsInfinite.fetchNextPage();
    }
  }, [bookingsInfinite.hasNextPage, bookingsInfinite.isFetchingNextPage, bookingsInfinite.data]);

  const bookingsRaw: BookingRow[] = useMemo(
    () => bookingsInfinite.data?.pages.flatMap(p => p.items) || [],
    [bookingsInfinite.data]
  );
  const bookingsLoading = bookingsInfinite.isLoading;




  // Per-unit booking lines: needed so a multi-room stay draws one bar per room.
  const bookingIdsForLines = useMemo(() => bookingsRaw.map((b) => b.id), [bookingsRaw]);
  const { roomTypeIdsByBooking, roomIdsByBooking, linesByBooking } = useBookingRoomLines(bookingIdsForLines);

  const bookingsWithLines: BookingRow[] = useMemo(
    () => bookingsRaw.map((b) => {
      const lineTypes = roomTypeIdsByBooking.get(b.id);
      const lineRooms = roomIdsByBooking.get(b.id);
      if (!lineTypes?.length && !lineRooms?.length) return b;
      const existing = b.rolos_room_ids || [];
      return {
        ...b,
        line_room_type_ids: lineTypes || null,
        rolos_room_ids: existing.length ? existing : (lineRooms?.length ? lineRooms : existing),
      } as BookingRow;
    }),
    [bookingsRaw, roomTypeIdsByBooking, roomIdsByBooking]
  );

  const bookings: BookingRow[] = useMemo(
    () => autoAssignBookings(
      remapBookingsToCanonicalRoomTypes(bookingsWithLines, [...aliasRoomTypes, ...roomTypeNamesForRooms], roomTypes),
      rooms,
      roomTypes,
      [...aliasRoomTypes, ...roomTypeNamesForRooms],
    ) as BookingRow[],
    [bookingsWithLines, rooms, roomTypes, aliasRoomTypes, roomTypeNamesForRooms]
  );


  // Persist resolved unit assignments so folio, housekeeping and check-in all agree
  // with what the grid shows (the matcher itself is presentation-only).
  useEffect(() => {
    const pending = bookings.filter((b) => {
      const resolved = b.rolos_room_ids || [];
      const original = bookingsRaw.find((raw) => raw.id === b.id)?.rolos_room_ids || [];
      return resolved.length > 0 && original.length === 0;
    });
    if (!pending.length) return;
    let cancelled = false;
    (async () => {
      for (const b of pending) {
        if (cancelled) return;
        await supabase.from("bookings").update({ rolos_room_ids: b.rolos_room_ids }).eq("id", b.id);
      }
    })();
    return () => { cancelled = true; };
  }, [bookings, bookingsRaw]);


  const openBookingSheet = useCallback((booking: BookingRow, tab: BookingDetailTab = "details") => {
    setBookingSheetTab(tab);
    setSelectedBooking(booking);
  }, []);

  const closeBookingSheet = useCallback(() => {
    setSelectedBooking(null);
    setBookingSheetTab("details");
  }, []);

  // Fetch today's arrivals & departures
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: todayArrivals = [] } = useQuery({
    queryKey: ["pms-arrivals", propertyId, today],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, guest_name, check_in_date, check_out_date, status, room_type_id")
        .eq("property_id", propertyId)
        .eq("check_in_date", today)
        .in("status", ["confirmed", "pending"])
        .limit(20);
      return data || [];
    },
    enabled: !!propertyId,
  });

  const { data: todayDepartures = [] } = useQuery({
    queryKey: ["pms-departures", propertyId, today],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, guest_name, check_in_date, check_out_date, status")
        .eq("property_id", propertyId)
        .eq("check_out_date", today)
        .in("status", ["confirmed", "checked_in"])
        .limit(20);
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Recent bookings — surfaces newly created reservations regardless of calendar window
  const { data: recentBookings = [] } = useQuery({
    queryKey: ["pms-recent-bookings", propertyId],
    queryFn: async () => {
      if (!propertyId) return [] as BookingRow[];
      const { data } = await supabase
        .from("bookings")
        .select("id, guest_name, guest_email, check_in_date, check_out_date, status, payment_status, total_price, created_at, booking_channel, room_type_id, rolos_room_ids, adults, children, infants, teens")
        .eq("property_id", propertyId)
        .neq("status", "cancelled")
        .gte("check_out_date", format(new Date(), "yyyy-MM-dd"))
        .order("created_at", { ascending: false })
        .limit(10);
      return (data || []) as unknown as BookingRow[];
    },
    enabled: !!propertyId,
    refetchInterval: 60_000,
  });


  const { data: ratePlansWithRate = [] } = useQuery({
    queryKey: ["pms-cal-rate-plans", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("rolos_rate_plans")
        .select("id, name, base_rate, pricing_model")
        .eq("property_id", propertyId)
        .eq("is_active", true);
      return (data || []) as { id: string; name: string; base_rate: number | null; pricing_model?: string }[];
    },
    enabled: !!propertyId,
  });

  // Fetch rate plan → room type links
  const { data: ratePlanRoomLinks = [] } = useQuery({
    queryKey: ["pms-cal-rate-plan-links", propertyId, roomTypes],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data: plans } = await supabase
        .from("rolos_rate_plans")
        .select("id")
        .eq("property_id", propertyId)
        .eq("is_active", true);
      if (!plans?.length) return [];
      const { data } = await supabase
        .from("rolos_rate_plan_room_types")
        .select("rate_plan_id, room_type_id")
        .in("rate_plan_id", plans.map(p => p.id));

      const canonicalRoomTypeIdByName = new Map(roomTypes.map((roomType) => [roomType.name.trim().toLowerCase(), roomType.id]));
      const roomTypeNameById = new Map(roomTypes.map((roomType) => [roomType.id, roomType.name.trim().toLowerCase()]));

      return (data || []).map((link) => {
        const canonicalName = roomTypeNameById.get(link.room_type_id);
        const canonicalRoomTypeId = canonicalName ? canonicalRoomTypeIdByName.get(canonicalName) : undefined;
        return {
          rate_plan_id: link.rate_plan_id,
          room_type_id: canonicalRoomTypeId || link.room_type_id,
        };
      }) as { rate_plan_id: string; room_type_id: string }[];
    },
    enabled: !!propertyId && roomTypes.length > 0,
  });

  const { data: rateSeasons = [] } = useQuery({
    queryKey: ["pms-cal-seasons", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data: plans } = await supabase
        .from("rolos_rate_plans")
        .select("id")
        .eq("property_id", propertyId)
        .eq("is_active", true);
      if (!plans?.length) return [];
      const planIds = plans.map(p => p.id);
      const { data } = await supabase
        .from("rolos_rate_seasons")
        .select("id, name, start_date, end_date, is_peak, rate_plan_id, min_stay_override")
        .in("rate_plan_id", planIds);
      return (data || []) as RateSeason[];
    },
    enabled: !!propertyId,
  });

  const { data: ratePrices = [] } = useQuery({
    queryKey: ["pms-cal-prices", propertyId, rateSeasons.map(s => s.id).join(",")],
    queryFn: async () => {
      if (!rateSeasons.length) return [];
      const seasonIds = rateSeasons.map(s => s.id);
      const { data } = await supabase
        .from("rolos_rate_prices")
        .select("id, base_rate, room_type_id, season_id")
        .in("season_id", seasonIds);
      return (data || []) as RatePrice[];
    },
    enabled: rateSeasons.length > 0,
  });

  // Fallback: fetch pms_availability_cache rates keyed by rolos_room_type_id
  // This covers Benson/HotelBeds properties where rates may not yet be in rolos_rate_plans
  const { data: cacheRates = [] } = useQuery({
    queryKey: ["pms-cache-rates", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      // Get distinct room types from cache with their rates
      const { data } = await supabase
        .from("pms_availability_cache" as any)
        .select("external_room_type_id, rates, raw_data")
        .eq("property_id", propertyId)
        .not("rates", "is", null)
        .limit(200);
      return (data || []) as unknown as { external_room_type_id: string; rates: any; raw_data: any }[];
    },
    enabled: !!propertyId,
  });

  // Build a map: rolos_room_type_id → best rate from cache
  const cacheRateMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!cacheRates.length || !roomTypes.length) return map;
    // Build external_id → rolos_room_type_id mapping via name match
    for (const entry of cacheRates) {
      const name = entry.raw_data?.roomTypeName || entry.raw_data?.room_type_name;
      if (!name) continue;
      // Match to roomType by name
      const rt = roomTypes.find(t => t.name === name);
      if (!rt || map.has(rt.id)) continue;
      // Extract best rate
      const rates = Array.isArray(entry.rates) ? entry.rates : [];
      for (const r of rates) {
        const amount = r.room_amount || r.adult_amounts?.adultAmount1 || r.adult_amounts?.adult_amount_1;
        if (amount && amount > 0) {
          map.set(rt.id, amount);
          break;
        }
      }
    }
    return map;
  }, [cacheRates, roomTypes]);

  // Fetch availability overrides
  const { data: availOverrides = [], refetch: refetchOverrides } = useQuery({
    queryKey: ["pms-cal-overrides", propertyId, format(dateRange.start, "yyyy-MM-dd"), format(dateRange.end, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("property_availability")
        .select("room_type, date, is_stop_sell, minimum_stay, maximum_stay, lead_days_advance, lead_days_post, available_units, blocked_by_label, blocked_reason, blocked_at, external_system")
        .eq("property_id", propertyId)
        .gte("date", format(dateRange.start, "yyyy-MM-dd"))
        .lte("date", format(dateRange.end, "yyyy-MM-dd"));
      return (data || []) as AvailabilityOverride[];
    },
    enabled: !!propertyId,
    // Restrictions are edited in place — never serve a cached copy after a change.
    staleTime: 0,
  });

  // Build override lookup
  const overrideMap = useMemo(() => {
    const map = new Map<string, AvailabilityOverride>();
    availOverrides.forEach(o => map.set(`${o.room_type}-${o.date}`, o));
    return map;
  }, [availOverrides]);

  // ──────────── Portfolio-level queries (only in portfolio mode) ────────────
  const { data: portfolioRoomTypesRaw = [] } = useQuery({
    queryKey: ["pms-portfolio-room-types", portfolioPropertyIds],
    queryFn: async () => {
      if (!portfolioPropertyIds.length) return [];
      await Promise.allSettled(portfolioPropertyIds.map(id => syncRolosRoomTypesFromOverview(id)));
      const { data } = await supabase
        .from("rolos_room_types")
        .select("id, name, default_rate, is_active, max_occupancy, linked_overview_id, property_id")
        .in("property_id", portfolioPropertyIds)
        .eq("is_active", true)
        .order("name");
      return (data || []) as (RoomType & { property_id: string })[];
    },
    enabled: isPortfolioMode,
  });

  const { data: portfolioRoomsRaw = [] } = useQuery({
    queryKey: ["pms-portfolio-rooms", portfolioPropertyIds],
    queryFn: async () => {
      if (!portfolioPropertyIds.length) return [];
      const { data } = await supabase
        .from("rolos_rooms")
        .select("id, room_number, room_name, room_type_id, status, property_id")
        .in("property_id", portfolioPropertyIds)
        .order("room_number");
      return (data || []) as (Room & { property_id: string })[];
    },
    enabled: isPortfolioMode,
  });

  const { data: portfolioBookingsRaw = [] } = useQuery({
    queryKey: ["pms-portfolio-bookings", portfolioPropertyIds, format(dateRange.start, "yyyy-MM-dd"), format(dateRange.end, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!portfolioPropertyIds.length) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, updated_at, guest_name, guest_email, guest_phone, check_in_date, check_out_date, status, adults, children, infants, pets, teens, total_price, special_requests, special_requests_parsed, requires_intervention, rol_reference, external_reservation_id, booking_channel, payment_status, payment_method, rolos_check_in_time, rolos_check_out_time, rolos_room_ids, rolos_rate_plan_id, modification_notes, room_type_id, rolos_guest_id, property_id, integration_type, hold_expires_at, hold_released_at, booker_is_guest, booker_name, booker_email, booker_phone, company_account_id, agent_account_id, source_account_id, market_segment, comm_channel, invoice_to_name, invoice_to_vat, invoice_to_address, guest_company, second_guest_name, booking_made_by, internal_notes, deposit_amount, payment_reference, created_at")
        .in("property_id", portfolioPropertyIds)
        .neq("status", "cancelled")
        .lte("check_in_date", format(dateRange.end, "yyyy-MM-dd"))
        .gte("check_out_date", format(dateRange.start, "yyyy-MM-dd"))
        .limit(1000);
      return (data || []) as (BookingRow & { property_id: string })[];
    },
    enabled: isPortfolioMode,
  });

  /* Imported history (NightsBridge exports and similar) often sits entirely outside the
   * forward-looking calendar window, which reads as "no bookings". Surface the real coverage
   * and let the user jump straight to it instead of showing an empty grid. */
  const coverageIds = useMemo(
    () => (isPortfolioMode ? portfolioPropertyIds : propertyId ? [propertyId] : []),
    [isPortfolioMode, portfolioPropertyIds, propertyId],
  );
  const { data: bookingCoverage } = useBookingCoverage(coverageIds);

  // Live booking feed — channel requests are written by an edge function, so without this
  // the calendar only learns about them on the next manual reload.
  useRealtimeBookings({
    propertyIds: coverageIds,
    onChange: (event) => {
      queryClient.invalidateQueries({ queryKey: ["pms-cal-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["pms-portfolio-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["pms-arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["pms-departures"] });
      // A channel modification moves the stay AND its blocked nights — redraw both layers.
      queryClient.invalidateQueries({ queryKey: ["pms-cal-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["pms-cal-rooms"] });
      queryClient.invalidateQueries({ queryKey: ["pms-booking-room-lines"] });

      if (event?.isNew) {
        const stay = event.checkIn && event.checkOut ? ` ${event.checkIn} → ${event.checkOut}` : "";
        toast.info(`New reservation${stay}`, { description: event.guestName || undefined });
      }
    },
  });
  const visibleBookingCount = isPortfolioMode ? portfolioBookingsRaw.length : bookingsRaw.length;
  const outsideWindowNotice = useMemo(() => {
    if (bookingsLoading || visibleBookingCount > 0) return null;
    if (!bookingCoverage || bookingCoverage.total === 0) return null;
    const windowStart = format(dateRange.start, "yyyy-MM-dd");
    const target =
      bookingCoverage.latest && bookingCoverage.latest < windowStart
        ? bookingCoverage.latest
        : bookingCoverage.earliest;
    if (!target) return null;
    return { total: bookingCoverage.total, target };
  }, [bookingsLoading, visibleBookingCount, bookingCoverage, dateRange.start]);


  const { data: portfolioOverridesRaw = [] } = useQuery({
    queryKey: ["pms-portfolio-overrides", portfolioPropertyIds, format(dateRange.start, "yyyy-MM-dd"), format(dateRange.end, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!portfolioPropertyIds.length) return [];
      const { data } = await supabase
        .from("property_availability")
        .select("room_type, date, is_stop_sell, minimum_stay, maximum_stay, lead_days_advance, lead_days_post, available_units, property_id, blocked_by_label, blocked_reason, blocked_at, external_system")
        .in("property_id", portfolioPropertyIds)
        .gte("date", format(dateRange.start, "yyyy-MM-dd"))
        .lte("date", format(dateRange.end, "yyyy-MM-dd"));
      return (data || []) as (AvailabilityOverride & { property_id: string })[];
    },
    enabled: isPortfolioMode,
    staleTime: 0,
  });

  const { data: portfolioAliasRoomTypes = [] } = useQuery({
    queryKey: ["pms-portfolio-alias-room-types", portfolioPropertyIds],
    queryFn: async () => {
      if (!portfolioPropertyIds.length) return [];
      const { data } = await supabase
        .from("hostfully_room_types")
        .select("id, name, property_id")
        .in("property_id", portfolioPropertyIds);
      return (data || []).map((t) => ({ id: t.id, name: t.name || "", property_id: t.property_id }));
    },
    enabled: isPortfolioMode,
  });

  const { data: portfolioPropertiesData = [] } = useQuery({
    queryKey: ["pms-portfolio-props-data", portfolioPropertyIds],
    queryFn: async () => {
      if (!portfolioPropertyIds.length) return [];
      const { data } = await supabase
        .from("properties")
        .select("id, name, amenities, is_rol_property")
        .in("id", portfolioPropertyIds);
      return (data || []) as { id: string; name: string; amenities: any; is_rol_property: boolean }[];
    },
    enabled: isPortfolioMode,
  });


  // Group portfolio data by property
  // Portfolio grids need the same per-unit line data so multi-room stays span every unit.
  const portfolioBookingIds = useMemo(
    () => (isPortfolioMode ? portfolioBookingsRaw.map((b) => (b as { id: string }).id) : []),
    [isPortfolioMode, portfolioBookingsRaw],
  );
  const portfolioLines = useBookingRoomLines(portfolioBookingIds);
  const portfolioBookingsWithLines = useMemo(
    () => portfolioBookingsRaw.map((raw) => {
      const b = raw as BookingRow;
      const lineTypes = portfolioLines.roomTypeIdsByBooking.get(b.id);
      const lineRooms = portfolioLines.roomIdsByBooking.get(b.id);
      if (!lineTypes?.length && !lineRooms?.length) return b;
      const existing = b.rolos_room_ids || [];
      return {
        ...b,
        line_room_type_ids: lineTypes || null,
        rolos_room_ids: existing.length ? existing : (lineRooms?.length ? lineRooms : existing),
      } as BookingRow;
    }),
    [portfolioBookingsRaw, portfolioLines],
  );

  const portfolioDataByProperty = useMemo(() => {

    if (!isPortfolioMode) return new Map<string, { roomTypes: RoomType[]; rooms: Room[]; bookings: BookingRow[]; overrideMap: Map<string, AvailabilityOverride>; roomsByType: Map<string, Room[]>; propertyData: any }>();
    const map = new Map<string, { roomTypes: RoomType[]; rooms: Room[]; bookings: BookingRow[]; overrideMap: Map<string, AvailabilityOverride>; roomsByType: Map<string, Room[]>; propertyData: any }>();

    for (const prop of portfolioProperties || []) {
      const propRoomTypesRaw = portfolioRoomTypesRaw.filter(rt => (rt as any).property_id === prop.id) as RoomType[];
      const propRoomsRawForProp = portfolioRoomsRaw.filter(r => (r as any).property_id === prop.id) as Room[];
      const propData = portfolioPropertiesData.find(p => p.id === prop.id);

      // Deduplicate room types using same logic as single-property mode
      let propRoomTypes = propRoomTypesRaw;
      const canonicalAmenityNames = new Set(
        (((propData as any)?.is_rol_property ? (propData as any)?.amenities?.room_types : []) || [])
          .map((roomType: any) => String(roomType?.name || "").trim().toLowerCase())
          .filter(Boolean)
      );
      if (canonicalAmenityNames.size > 0) {
        const deduped = new Map<string, RoomType>();
        for (const roomType of propRoomTypesRaw) {
          const normalizedName = roomType.name.trim().toLowerCase();
          if (!canonicalAmenityNames.has(normalizedName)) continue;
          const existing = deduped.get(normalizedName);
          if (!existing) {
            deduped.set(normalizedName, roomType);
            continue;
          }
          const existingScore = Number(Boolean(existing.linked_overview_id)) * 10 + Number(existing.default_rate ?? 0);
          const nextScore = Number(Boolean(roomType.linked_overview_id)) * 10 + Number(roomType.default_rate ?? 0);
          if (nextScore > existingScore) {
            deduped.set(normalizedName, roomType);
          }
        }
        propRoomTypes = Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
      }

      // Keep physical rooms whose legacy/stale room_type_id maps by name to the canonical active type.
      // This prevents valid units like GRYSBOK from disappearing when duplicate type rows exist.
      const propRooms = normalizeRoomsToCanonicalRoomTypes(propRoomsRawForProp, propRoomTypesRaw, propRoomTypes);
      const propBookingsRaw = portfolioBookingsWithLines.filter(b => (b as any).property_id === prop.id) as BookingRow[];
      const propAliasTypes = [
        ...portfolioAliasRoomTypes.filter(t => t.property_id === prop.id),
        ...propRoomTypesRaw.map(rt => ({ id: rt.id, name: rt.name, property_id: prop.id })),
      ];
      const propBookings = autoAssignBookings(
        remapBookingsToCanonicalRoomTypes(propBookingsRaw, propAliasTypes, propRoomTypes),
        propRooms,
        propRoomTypes,
        propAliasTypes,
      ) as BookingRow[];

      const propOverrides = portfolioOverridesRaw.filter(o => (o as any).property_id === prop.id);

      const oMap = new Map<string, AvailabilityOverride>();
      propOverrides.forEach(o => oMap.set(`${o.room_type}-${o.date}`, o));

      const rbtMap = new Map<string, Room[]>();
      const roomTypeIdByName = new Map(propRoomTypes.map(rt => [rt.name.trim().toLowerCase(), rt.id]));
      const namesCovered = new Set<string>();
      propRooms.forEach(room => {
        const matched = propRoomTypes.find(rt => rt.id === room.room_type_id);
        if (matched) namesCovered.add(matched.name.trim().toLowerCase());
      });
      propRooms.forEach(room => {
        const matched = propRoomTypes.find(rt => rt.id === room.room_type_id);
        if (matched) {
          if (!rbtMap.has(matched.id)) rbtMap.set(matched.id, []);
          rbtMap.get(matched.id)!.push(room);
        } else {
          const normName = String(room.room_name || room.room_number || "").trim().toLowerCase();
          const canonId = roomTypeIdByName.get(normName);
          if (canonId && !namesCovered.has(normName)) {
            if (!rbtMap.has(canonId)) rbtMap.set(canonId, []);
            rbtMap.get(canonId)!.push(room);
          }
        }
      });

      map.set(prop.id, { roomTypes: propRoomTypes, rooms: propRooms, bookings: propBookings, overrideMap: oMap, roomsByType: rbtMap, propertyData: propData });
    }
    return map;
  }, [isPortfolioMode, portfolioProperties, portfolioRoomTypesRaw, portfolioRoomsRaw, portfolioBookingsWithLines, portfolioOverridesRaw, portfolioPropertiesData, portfolioAliasRoomTypes]);

  // Resolve room names for a booking (single or portfolio mode)
  const getBookingRoomNames = useCallback((b: BookingRow): string[] => {
    const roomIds = b.rolos_room_ids || [];
    if (roomIds.length === 0) return [];
    if (isPortfolioMode && b.property_id) {
      const propRooms = portfolioDataByProperty.get(b.property_id)?.rooms || [];
      return roomIds
        .map(id => propRooms.find(r => r.id === id))
        .filter((r): r is Room => !!r)
        .map(r => r.room_name || r.room_number || "")
        .filter(Boolean);
    }
    return roomIds
      .map(id => rooms.find(r => r.id === id))
      .filter((r): r is Room => !!r)
      .map(r => r.room_name || r.room_number || "")
      .filter(Boolean);
  }, [isPortfolioMode, portfolioDataByProperty, rooms]);

  // Quick check-in / check-out from the arrivals/departures cards
  const handleQuickAction = useCallback(async (booking: BookingRow, action: "check_in" | "check_out") => {
    setQuickAction({ bookingId: booking.id, action });
    try {
      const res = await callPmsApi(action, { booking_id: booking.id });
      if (!res.success) {
        if (res.error?.code === "ROOMS_NOT_READY") {
          toast.error("Assigned rooms are not ready. Open the booking to reassign rooms before checking in.");
        } else {
          throw new Error(res.error?.message || "Action failed");
        }
      } else {
        toast.success(action === "check_in" ? "Guest checked in" : "Guest checked out");
        queryClient.invalidateQueries({ queryKey: ["pms-cal-bookings"] });
        queryClient.invalidateQueries({ queryKey: ["pms-portfolio-bookings"] });
        queryClient.invalidateQueries({ queryKey: ["pms-arrivals"] });
        queryClient.invalidateQueries({ queryKey: ["pms-departures"] });
        queryClient.invalidateQueries({ queryKey: ["pms-cal-rooms"] });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setQuickAction(null);
    }
  }, [queryClient]);

  const getPortfolioRateForDate = useCallback((propId: string, roomTypeId: string, date: Date): number | null => {
    const propData = portfolioDataByProperty.get(propId);
    if (!propData) return null;
    const rt = propData.roomTypes.find(t => t.id === roomTypeId);
    if (!rt) return null;
    const amenities = propData.propertyData?.amenities;
    const dateStr = format(date, "yyyy-MM-dd");
    if (amenities?.seasons?.length && amenities?.season_rates) {
      let amenityIdForName: string | null = null;
      if (rt.name && Array.isArray(amenities.room_types)) {
        const match = amenities.room_types.find((art: any) => art?.name && art.name.toLowerCase() === rt.name.toLowerCase());
        if (match?.id) amenityIdForName = String(match.id);
      }
      const roomSeasonRates = amenities.season_rates[roomTypeId]
        || (rt.linked_overview_id ? amenities.season_rates[rt.linked_overview_id] : null)
        || (rt.name ? amenities.season_rates[rt.name] : null)
        || (amenityIdForName ? amenities.season_rates[amenityIdForName] : null);
      if (roomSeasonRates) {
        for (const season of amenities.seasons) {
          const periods = season.periods?.length ? season.periods : [{ from: season.from || season.startDate, to: season.to || season.endDate }];
          const inSeason = periods.some((p: any) => dateStr >= p.from && dateStr <= p.to);
          if (inSeason) {
            let seasonRate = roomSeasonRates[season.id];
            if (!seasonRate) {
              const fallbackKey = Object.keys(roomSeasonRates).find(k => k.startsWith(`${season.id}-`));
              if (fallbackKey) seasonRate = roomSeasonRates[fallbackKey];
            }
            if (seasonRate?.roomAmount != null) return seasonRate.roomAmount;
            if (typeof seasonRate === 'number') return seasonRate;
            break;
          }
        }
      }
    }
    return rt.default_rate || null;
  }, [portfolioDataByProperty]);

  // Group rooms by room type
  const roomsByType = useMemo(() => {
    const map = new Map<string, Room[]>();
    const roomTypeIdByName = new Map(roomTypes.map((roomType) => [roomType.name.trim().toLowerCase(), roomType.id]));
    // Track which canonical type names already have a direct-ID-matched room to avoid duplicates from name fallback
    const namesCoveredByDirectMatch = new Set<string>();

    // First pass: find all rooms that match an active type by ID
    rooms.forEach((room) => {
      const matchedRoomType = roomTypes.find((roomType) => roomType.id === room.room_type_id);
      if (matchedRoomType) {
        namesCoveredByDirectMatch.add(matchedRoomType.name.trim().toLowerCase());
      }
    });

    rooms.forEach((room) => {
      const matchedRoomType = roomTypes.find((roomType) => roomType.id === room.room_type_id);
      if (matchedRoomType) {
        // Direct ID match — always include
        if (!map.has(matchedRoomType.id)) map.set(matchedRoomType.id, []);
        map.get(matchedRoomType.id)!.push(room);
      } else {
        // Name fallback — only include if this name doesn't already have a direct-matched room
        const normalizedRoomName = String(room.room_name || room.room_number || "").trim().toLowerCase();
        const canonicalTypeId = roomTypeIdByName.get(normalizedRoomName);
        if (canonicalTypeId && !namesCoveredByDirectMatch.has(normalizedRoomName)) {
          if (!map.has(canonicalTypeId)) map.set(canonicalTypeId, []);
          map.get(canonicalTypeId)!.push(room);
        }
        // If name is already covered by a direct match, skip this phantom room
      }
    });

    return map;
  }, [rooms, roomTypes]);

  // Dynamic stats based on actual bookings for today
  // Uses rolos_rooms if available, otherwise derives unit counts from room types
  const dynamicStats = useMemo(() => {
    const WHOLE_PROPERTY_TYPES = ['self_catering', 'villa', 'cottage', 'holiday_house', 'house', 'holiday'];
    const physicalRooms = rooms.filter(r => r.status !== "out_of_service").length;

    // If no physical rooms registered, each room type = 1 bookable unit
    const totalRooms = physicalRooms > 0
      ? physicalRooms
      : roomTypes.length;

    const todayStr = format(new Date(), "yyyy-MM-dd");
    const activeBookingsToday = bookings.filter(b =>
      todayStr >= b.check_in_date && todayStr < b.check_out_date &&
      !["cancelled", "no_show"].includes(b.status)
    );

    // Count occupied: use room IDs if available, else count bookings
    let occupied: number;
    if (physicalRooms > 0) {
      const occupiedRoomIds = new Set<string>();
      activeBookingsToday.forEach(b => {
        b.rolos_room_ids?.forEach(rid => occupiedRoomIds.add(rid));
      });
      occupied = occupiedRoomIds.size;
    } else {
      // No physical rooms — count distinct bookings per room type today
      occupied = activeBookingsToday.length;
    }

    const available = Math.max(0, totalRooms - occupied);
    const occupancyPct = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;
    const dirty = rooms.filter(r => r.status === "dirty").length;
    const maintenance = rooms.filter(r => r.status === "maintenance" || r.status === "out_of_order").length;

    return { totalRooms, occupied, available, occupancyPct, dirty, maintenance };
  }, [rooms, roomTypes, bookings]);

  // Portfolio-aware aggregated stats + arrivals/departures
  const portfolioAggregate = useMemo(() => {
    if (!isPortfolioMode) return null;
    const todayStr = format(new Date(), "yyyy-MM-dd");
    let totalRooms = 0, occupied = 0, dirty = 0, maintenance = 0;
    const arrivals: BookingRow[] = [];
    const departures: BookingRow[] = [];
    for (const [, pd] of portfolioDataByProperty) {
      const displayedRooms = Array.from(pd.roomsByType.values()).flat() as Room[];
      const displayedRoomIds = new Set(displayedRooms.filter(r => r.status !== "out_of_service").map(r => r.id));
      const physical = displayedRoomIds.size || pd.rooms.filter(r => r.status !== "out_of_service").length;
      const tRooms = physical > 0 ? physical : pd.roomTypes.length;
      totalRooms += tRooms;
      const activeToday = pd.bookings.filter(b =>
        todayStr >= b.check_in_date && todayStr < b.check_out_date &&
        !["cancelled", "no_show"].includes(b.status)
      );
      if (physical > 0) {
        const ids = new Set<string>();
        activeToday.forEach(b => b.rolos_room_ids?.forEach(rid => ids.add(rid)));
        occupied += ids.size;
      } else {
        occupied += activeToday.length;
      }
      const roomsForStatus = displayedRooms.length ? displayedRooms : pd.rooms;
      dirty += roomsForStatus.filter(r => r.status === "dirty").length;
      maintenance += roomsForStatus.filter(r => r.status === "maintenance" || r.status === "out_of_order").length;
      pd.bookings.forEach(b => {
        if (b.check_in_date === todayStr && ["confirmed", "pending"].includes(b.status)) arrivals.push(b);
        if (b.check_out_date === todayStr && ["confirmed", "checked_in"].includes(b.status)) departures.push(b);
      });
    }
    const available = Math.max(0, totalRooms - occupied);
    const occupancyPct = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;
    return { totalRooms, occupied, available, occupancyPct, dirty, maintenance, arrivals, departures };
  }, [isPortfolioMode, portfolioDataByProperty]);

  const effectiveStats = portfolioAggregate ?? dynamicStats;
  const effectiveArrivals: BookingRow[] = portfolioAggregate ? portfolioAggregate.arrivals : (todayArrivals as BookingRow[]);
  const effectiveDepartures: BookingRow[] = portfolioAggregate ? portfolioAggregate.departures : (todayDepartures as BookingRow[]);

  const hasBookingOnDate = useCallback((date: Date): boolean => {
    const dateStr = format(date, "yyyy-MM-dd");
    if (!isPortfolioMode) {
      return (bookings as BookingRow[]).some((booking) => bookingTouchesDate(booking, dateStr));
    }
    for (const [, propertyDataForDate] of portfolioDataByProperty) {
      if (propertyDataForDate.bookings.some((booking) => bookingTouchesDate(booking, dateStr))) return true;
    }
    return false;
  }, [isPortfolioMode, portfolioDataByProperty, bookings]);

  // Single-property: filtered dates + room types (only rows that actually carry a live booking)
  const singleBookedView = useMemo(
    () => filterToBookedView(dates, bookings as BookingRow[], roomTypes as RoomType[], roomsByType),
    [dates, bookings, roomTypes, roomsByType]
  );

  const visibleDates = useMemo(
    () => (showOnlyBookedDays ? singleBookedView.visibleDates : dates),
    [showOnlyBookedDays, dates, singleBookedView]
  );

  const visibleRoomTypes = useMemo(
    () => (showOnlyBookedDays ? singleBookedView.visibleRoomTypes : (roomTypes as RoomType[])),
    [showOnlyBookedDays, singleBookedView, roomTypes]
  );

  const visibleWeekChunks = useMemo(
    () => (showOnlyBookedDays
      ? weekChunks.map((weekDates) => weekDates.filter(hasBookingOnDate)).filter((weekDates) => weekDates.length > 0)
      : weekChunks),
    [showOnlyBookedDays, weekChunks, hasBookingOnDate]
  );

  // Portfolio: per-property booked view keyed by property id (never portfolio-wide dates)
  const portfolioBookedViewByProperty = useMemo(() => {
    const map = new Map<string, { visibleDates: Date[]; visibleRoomTypes: RoomType[] }>();
    if (!isPortfolioMode) return map;
    for (const [propId, propData] of portfolioDataByProperty) {
      map.set(propId, filterToBookedView(dates, propData.bookings, propData.roomTypes, propData.roomsByType));
    }
    return map;
  }, [isPortfolioMode, portfolioDataByProperty, dates]);

  const portfolioHasAnyBookedDay = useMemo(
    () => Array.from(portfolioBookedViewByProperty.values()).some((view) => view.visibleDates.length > 0),
    [portfolioBookedViewByProperty]
  );


  const getPortfolioBookingCountForDates = useCallback((targetDates: Date[]): number => {
    if (!isPortfolioMode || targetDates.length === 0) return 0;
    const dateKeys = targetDates.map((date) => format(date, "yyyy-MM-dd"));
    const bookingIds = new Set<string>();
    for (const [, propertyDataForWeek] of portfolioDataByProperty) {
      propertyDataForWeek.bookings.forEach((booking) => {
        if (dateKeys.some((dateKey) => bookingTouchesDate(booking, dateKey))) {
          bookingIds.add(booking.id);
        }
      });
    }
    return bookingIds.size;
  }, [isPortfolioMode, portfolioDataByProperty]);

  const getWeekKey = useCallback((weekDates: Date[]) => {
    const firstDate = weekDates[0];
    const lastDate = weekDates[weekDates.length - 1];
    if (!firstDate || !lastDate) return "empty-week";
    return `${format(firstDate, "yyyy-MM-dd")}:${format(lastDate, "yyyy-MM-dd")}`;
  }, []);

  const toggleWeekCollapsed = useCallback((weekKey: string) => {
    setCollapsedWeeks((previous) => {
      const next = new Set(previous);
      if (next.has(weekKey)) {
        next.delete(weekKey);
      } else {
        next.add(weekKey);
      }
      return next;
    });
  }, []);

  const selectedBookingPropertyId = selectedBooking?.property_id || propertyId || "";
  const selectedBookingRooms = useMemo(() => {
    if (selectedBooking?.property_id && isPortfolioMode) {
      return portfolioDataByProperty.get(selectedBooking.property_id)?.rooms || [];
    }
    return rooms;
  }, [isPortfolioMode, portfolioDataByProperty, rooms, selectedBooking?.property_id]);

  // Urgent rooms: dirty/maintenance rooms with same-day arrivals
  const urgentRooms = useMemo(() => {
    if (!todayArrivals.length || !rooms.length) return [];
    const dirtyRooms = rooms.filter(r => r.status === "dirty" || r.status === "maintenance");
    if (!dirtyRooms.length) return [];

    const results: { room: Room; guestName: string; issue: string }[] = [];
    for (const arrival of todayArrivals) {
      const arrivalRtId = (arrival as any).room_type_id as string | null;
      if (!arrivalRtId) continue;
      // Match room type by id or linked_overview_id
      const matchedTypes = roomTypes.filter(
        rt => rt.id === arrivalRtId || rt.linked_overview_id === arrivalRtId
      );
      const matchedTypeIds = new Set(matchedTypes.map(rt => rt.id));
      const flagged = dirtyRooms.filter(r => r.room_type_id && matchedTypeIds.has(r.room_type_id));
      for (const room of flagged) {
        if (!results.some(r => r.room.id === room.id)) {
          results.push({
            room,
            guestName: arrival.guest_name,
            issue: room.status === "dirty" ? "dirty" : "in maintenance",
          });
        }
      }
    }
    return results;
  }, [todayArrivals, rooms, roomTypes]);

  // Get rate for a room type on a date
  const getRateForDate = (roomTypeId: string, date: Date): number | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    // 1. Check rolos seasonal prices first
    for (const season of rateSeasons) {
      if (dateStr >= season.start_date && dateStr <= season.end_date) {
        const price = ratePrices.find(p => p.season_id === season.id && p.room_type_id === roomTypeId);
        if (price) return price.base_rate;
      }
    }
    
    // 2. Check amenities season_rates (canonical source from SeasonsCalendar)
    const amenities = (propertyData as any)?.amenities;
    if (amenities?.seasons?.length && amenities?.season_rates) {
      const rt = roomTypes.find(t => t.id === roomTypeId);
      const overviewId = rt?.linked_overview_id;
      
      // Build amenity ID lookup by name (for ROL properties where keys are numeric amenity IDs)
      let amenityIdForName: string | null = null;
      if (rt?.name && Array.isArray(amenities.room_types)) {
        const match = amenities.room_types.find((art: any) => 
          art?.name && art.name.toLowerCase() === rt.name.toLowerCase()
        );
        if (match?.id) amenityIdForName = String(match.id);
      }
      
      // Try rolos UUID, linked overview id, name, and amenity ID as keys
      const roomSeasonRates = amenities.season_rates[roomTypeId] 
        || (overviewId ? amenities.season_rates[overviewId] : null)
        || (rt?.name ? amenities.season_rates[rt.name] : null)
        || (amenityIdForName ? amenities.season_rates[amenityIdForName] : null);
      
      if (roomSeasonRates) {
        for (const season of amenities.seasons) {
          const periods = season.periods?.length ? season.periods : [{ from: season.from || season.startDate, to: season.to || season.endDate }];
          const inSeason = periods.some((p: any) => dateStr >= p.from && dateStr <= p.to);
          if (inSeason) {
            // Try all possible key formats
            const linkedPlanIds = ratePlanRoomLinks
              .filter(l => l.room_type_id === roomTypeId)
              .map(l => l.rate_plan_id);
            const ratePlanId = linkedPlanIds[0] || '';
            
            let seasonRate = roomSeasonRates[`${season.id}-${ratePlanId}`]
              || roomSeasonRates[`${season.id}-Self Catering`]
              || roomSeasonRates[season.id];
            
            // Fallback: find any key starting with the season ID
            if (!seasonRate) {
              const prefix = `${season.id}-`;
              const fallbackKey = Object.keys(roomSeasonRates).find(k => k.startsWith(prefix));
              if (fallbackKey) seasonRate = roomSeasonRates[fallbackKey];
            }
            
            if (seasonRate?.roomAmount != null) return seasonRate.roomAmount;
            if (typeof seasonRate === 'number') return seasonRate;
            break;
          }
        }
      }
    }
    
    // 3. Check linked rate plan base_rate
    const linkedPlanIds = ratePlanRoomLinks
      .filter(l => l.room_type_id === roomTypeId)
      .map(l => l.rate_plan_id);
    for (const planId of linkedPlanIds) {
      const plan = ratePlansWithRate.find(p => p.id === planId);
      if (plan?.base_rate && plan.base_rate > 0) return plan.base_rate;
    }
    // 4. Fallback to room type default_rate
    const rtFallback = roomTypes.find(t => t.id === roomTypeId);
    if (rtFallback?.default_rate) return rtFallback.default_rate;

    // 5. Fallback: check pms_availability_cache for non-ROL properties
    const cacheEntry = cacheRateMap?.get(roomTypeId);
    if (cacheEntry) return cacheEntry;

    return null;
  };

  // Get pricing model suffix for a room type (based on linked rate plans)
  const getPricingSuffix = (roomTypeId: string): string => {
    const linkedPlanIds = ratePlanRoomLinks
      .filter(l => l.room_type_id === roomTypeId)
      .map(l => l.rate_plan_id);
    for (const planId of linkedPlanIds) {
      const plan = ratePlansWithRate.find(p => p.id === planId);
      if (plan?.pricing_model === 'per_person') return '/pp';
      if (plan?.pricing_model === 'per_person_sharing') return '/pps';
      if (plan?.pricing_model === 'per_unit') return '';
    }
    return '';
  };

  // Get season for date
  const getSeasonForDate = (date: Date): RateSeason | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    return rateSeasons.find(s => dateStr >= s.start_date && dateStr <= s.end_date) || null;
  };

  // Get restriction for room type on date
  const getRestriction = (roomTypeName: string, date: Date): AvailabilityOverride | undefined => {
    return overrideMap.get(`${roomTypeName}-${format(date, "yyyy-MM-dd")}`);
  };

  /* Blocked nights live in property_availability keyed by room type NAME, so several
   * room-type records sharing a name (legacy duplicates) all read as blocked. */
  const makeIsBlocked = useCallback(
    (types: { id: string; name: string }[], oMap: Map<string, AvailabilityOverride>) => {
      const nameById = new Map(types.map(t => [t.id, t.name]));
      return (roomTypeId: string, date: Date): BlockDetail | null => {
        const name = nameById.get(roomTypeId);
        if (!name) return null;
        const o = oMap.get(`${name}-${format(date, "yyyy-MM-dd")}`);
        if (!o) return null;
        if (!isBlockedOverride(o)) return null;
        return blockDetailOf(o);
      };
    },
    [],
  );

  const isRoomTypeBlocked = useMemo(
    () => makeIsBlocked(roomTypes, overrideMap),
    [makeIsBlocked, roomTypes, overrideMap],
  );

  const portfolioIsBlockedByProperty = useMemo(() => {
    const map = new Map<string, (roomTypeId: string, date: Date) => BlockDetail | null>();
    portfolioDataByProperty.forEach((propData, propId) => {
      map.set(propId, makeIsBlocked(propData.roomTypes, propData.overrideMap));
    });
    return map;
  }, [portfolioDataByProperty, makeIsBlocked]);


  // Navigation
  const navigateBy = (dir: number) => {
    setAnchorDate(prev => addDays(prev, dir * (viewMode === "week" ? 7 : 30)));
  };
  const goToToday = () => setAnchorDate(new Date());

  // Room types for restriction dialogs
  const dialogRoomTypes = useMemo(() =>
    roomTypes.map(rt => ({
      name: rt.name,
      id: rt.id,
      units: (roomsByType.get(rt.id) || []).length,
    })),
    [roomTypes, roomsByType]
  );

  /** Any restriction add/edit/remove — refresh every view that draws restrictions at once. */
  const handleRuleCreated = useCallback(() => {
    invalidateRestrictionQueries(queryClient);
    refetchOverrides();
  }, [queryClient, refetchOverrides]);

  /** Right-click a hatched night → open its restriction span for editing. */
  const openBlockEditor = useCallback(
    (types: { id: string; name: string }[], propId: string | null | undefined) =>
      (roomTypeId: string, date: Date) => {
        const name = types.find((t) => t.id === roomTypeId)?.name;
        if (!name || !propId) return;
        setFocusBlock({ propertyId: propId, roomType: name, date: format(date, "yyyy-MM-dd") });
        setManageRestrictionsOpen(true);
      },
    [],
  );

  // ─── Room Plan interactions ───
  const refreshBookingQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["pms-cal-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["pms-portfolio-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["pms-arrivals"] });
    queryClient.invalidateQueries({ queryKey: ["pms-departures"] });
  }, [queryClient]);

  const handleRoomPlanCreate = useCallback((payload: RoomPlanCreatePayload & { propertyId?: string | null }) => {
    setRoomPlanPrefill({
      propertyId: payload.propertyId || propertyId,
      roomTypeId: payload.roomTypeId,
      roomId: payload.roomId,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
    });
    setManualBookingOpen(true);
  }, [propertyId]);

  const handleRoomPlanMove = useCallback(async ({ booking, roomId, roomTypeId, roomTypeChanged, checkIn, checkOut, datesChanged }: RoomPlanMovePayload) => {
    try {
      if (datesChanged) {
        const { data, error } = await supabase.functions.invoke("modify-booking", {
          body: {
            booking_id: booking.id,
            modifications: { check_in_date: checkIn, check_out_date: checkOut },
            expected_updated_at: (booking as { updated_at?: string | null }).updated_at ?? null,
          },
        });
        if (error) throw new Error(await extractFunctionError(error, "Could not move the reservation"));
        if (data && data.success === false) throw new Error(data.message || "Could not move the reservation");
      }
      const currentRooms = booking.rolos_room_ids || [];
      const nextRooms = roomId ? [roomId] : [];
      const roomsChanged = currentRooms.join(",") !== nextRooms.join(",");
      // The unit the stay lands on owns the truth about its room type. Deriving the
      // type from the target unit (not from the row it was dropped on) stops the
      // stay from being typed to one room type while sitting in another unit —
      // that mismatch draws the bar twice (once per type) and reads as a clone.
      const targetRoom = roomId ? rooms.find((r) => r.id === roomId) : null;
      const canonicalTypeId = targetRoom?.room_type_id || roomTypeId || booking.room_type_id || null;
      const typeChanged = !!canonicalTypeId && canonicalTypeId !== booking.room_type_id;
      if (roomsChanged || typeChanged || roomTypeChanged) {
        const update: Record<string, unknown> = {};
        if (roomsChanged) update.rolos_room_ids = nextRooms.length ? nextRooms : null;
        if (canonicalTypeId) update.room_type_id = canonicalTypeId;
        const { error } = await supabase.from("bookings").update(update).eq("id", booking.id);
        if (error) throw error;

        // The stay's room line has to follow, or the vacated unit keeps showing the
        // stay (reads as a duplicate) and keeps closing nights upstream.
        if (roomId) {
          const { data: lines } = await supabase
            .from("rolos_booking_rooms")
            .select("id, room_id")
            .eq("booking_id", booking.id)
            .neq("status", "cancelled");
          const rows = (lines || []) as { id: string; room_id: string | null }[];
          const originRoomId = currentRooms[0] || null;
          // Single-line stays always retarget. Multi-room stays move the line that
          // held the origin unit, else the first line with no unit yet.
          const targetLine =
            rows.length === 1
              ? rows[0]
              : rows.find((r) => originRoomId && r.room_id === originRoomId) ||
                rows.find((r) => !r.room_id) ||
                null;
          if (targetLine) {
            const lineUpdate: Record<string, unknown> = { room_id: roomId };
            if (canonicalTypeId) lineUpdate.room_type_id = canonicalTypeId;
            const { error: lineError } = await supabase
              .from("rolos_booking_rooms")
              .update(lineUpdate)
              .eq("id", targetLine.id);
            if (lineError) throw lineError;
          }
        }
      }
      toast.success("Reservation moved");
      refreshBookingQueries();
      // A move has to reach the channel as a reservation modification (so a channel-sourced stay
      // stops pointing at the unit it left) AND as an availability delta for both the vacated and
      // the newly sold unit. The sync function does both and reports rate-limit deferrals.
      if (roomsChanged || typeChanged || roomTypeChanged || datesChanged) {
        void pushBookingToChannel(booking.id, datesChanged ? "dates" : "moved", {
          source: "dashboard_move",
          previous: {
            room_type_id: booking.room_type_id ?? null,
            check_in_date: booking.check_in_date ?? null,
            check_out_date: booking.check_out_date ?? null,
          },
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move the reservation");
    }
  }, [refreshBookingQueries, propertyId, rooms]);


  const displayName = isPortfolioMode ? (portfolioName || "Portfolio") : (brandName || propertyData?.name || "");


  if (propLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!propertyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Sparkles className="h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold">Property Management</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Select a property from your Property Overview to access the PMS module.
        </p>
      </div>
    );
  }

  const statCards: Array<{ label: string; value: string | number; icon: typeof Building2; color: string; panel?: Exclude<DashboardPanel, null> }> = [
    { label: "Total Rooms", value: effectiveStats.totalRooms, icon: Building2, color: "text-foreground" },
    { label: "Available", value: effectiveStats.available, icon: BedDouble, color: "text-success" },
    { label: "Occupied", value: `${effectiveStats.occupied} (${effectiveStats.occupancyPct}%)`, icon: Users, color: "text-info" },
    { label: "Arrivals Today", value: effectiveArrivals.length, icon: CalendarCheck, color: "text-warning", panel: "arrivals" },
    { label: "Departures Today", value: effectiveDepartures.length, icon: TrendingUp, color: "text-purple-600", panel: "departures" },
    ...(!isPortfolioMode && recentBookings.length > 0
      ? [{ label: "Recent", value: recentBookings.length, icon: CalendarCheck, color: "text-primary", panel: "recent" as const }]
      : []),
    ...(effectiveStats.dirty > 0 ? [{ label: "Dirty", value: effectiveStats.dirty, icon: AlertTriangle, color: "text-amber-500" }] : []),
    ...(effectiveStats.maintenance > 0 ? [{ label: "Maintenance", value: effectiveStats.maintenance, icon: Ban, color: "text-destructive" }] : []),
  ];


  return (
    <>
      <div className="space-y-4">
        {/* Header with property switch & stats */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
            {displayProperties.length > 1 && !isPortfolioMode && (
              <Select value={propertyId || ""} onValueChange={switchProperty}>
                <SelectTrigger className="w-[220px] h-8 text-sm">
                  <SelectValue placeholder="Switch property" />
                </SelectTrigger>
                <SelectContent>
                  {displayProperties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                  {portfolioProperties && properties.length > portfolioProperties.length && (
                    <>
                      <div className="px-2 py-1 text-[10px] text-muted-foreground border-t mt-1 pt-1">All Properties</div>
                      {properties.filter(p => !portfolioProperties.some(pp => pp.id === p.id)).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            )}
            {showPortfolioToggle && (
              <ToggleGroup
                type="single"
                value={dashboardView}
                onValueChange={(v) => v && setDashboardView(v as "single" | "portfolio")}
                className="bg-muted/50 p-0.5 rounded-lg"
              >
                <ToggleGroupItem value="single" aria-label="Single Property" className="gap-1 px-2.5 py-1 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">
                  <Building2 className="h-3 w-3" />
                  <span className="hidden sm:inline">Single</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="portfolio" aria-label="Portfolio View" className="gap-1 px-2.5 py-1 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">
                  <Users className="h-3 w-3" />
                  <span className="hidden sm:inline">Portfolio</span>
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>

          {/* Compact stat pills — the arrival / departure / recent pills expand their list inline */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {statCards.map((stat) => (
              <button
                key={stat.label}
                type="button"
                disabled={!stat.panel}
                onClick={() => stat.panel && setOpenPanel((current) => (current === stat.panel ? null : stat.panel!))}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card shrink-0 text-left",
                  stat.panel && "hover:border-primary/50 transition-colors",
                  stat.panel && openPanel === stat.panel && "border-primary bg-primary/5"
                )}
              >
                <stat.icon className={cn("h-3.5 w-3.5 shrink-0", stat.color)} />
                <span className={cn("text-sm font-semibold tabular-nums", stat.color)}>{stat.value}</span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{stat.label}</span>
              </button>
            ))}

          </div>
        </div>

        {/* Today's Arrivals & Departures — expanded from the counter strip above */}
        {(openPanel === "arrivals" || openPanel === "departures") && (
          <div className="grid gap-3">
            {openPanel === "arrivals" && (

            <Card className="border-amber-500/30">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-warning" />
                  Today's Arrivals
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">{effectiveArrivals.length}</Badge>
              </CardHeader>
              <CardContent className="pt-0 max-h-64 overflow-y-auto">
                {effectiveArrivals.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No arrivals today</p>
                ) : effectiveArrivals.map((b: BookingRow) => {
                  const alreadyIn = b.status === "checked_in";
                  const propName = isPortfolioMode ? (portfolioProperties || []).find(p => p.id === b.property_id)?.name : null;
                  const roomNames = getBookingRoomNames(b);
                  const isQuickLoading = quickAction?.bookingId === b.id;
                  return (
                    <div key={b.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
                      <button
                        className="text-sm font-medium text-left hover:underline truncate flex-1 min-w-0"
                        onClick={() => openBookingSheet(b)}
                      >
                        <span className="block truncate">{b.guest_name}</span>
                        <span className="block text-[10px] text-muted-foreground truncate">
                          {propName && <span>{propName}</span>}
                          {propName && roomNames.length > 0 && <span> · </span>}
                          {roomNames.length > 0 && <span>{roomNames.join(", ")}</span>}
                          {!propName && roomNames.length === 0 && <span>No room assigned</span>}
                        </span>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px] capitalize">{b.status.replace(/_/g, " ")}</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2 py-0"
                          onClick={() => setCheckInBookingId(b.id)}
                        >
                          Check-in form
                        </Button>
                        {alreadyIn ? (
                          <Badge variant="secondary" className="text-[10px]">In House</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-6 text-[10px] px-2 py-0"
                            disabled={!!quickAction}
                            onClick={() => handleQuickAction(b, "check_in")}
                          >
                            {isQuickLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3 mr-1" />}
                            Check In
                          </Button>
                        )}
                      </div>

                    </div>
                  );
                })}
              </CardContent>
            </Card>
            )}
            {openPanel === "departures" && (
            <Card className="border-purple-500/30">

              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm flex items-center gap-2">
                  <LogOut className="h-4 w-4 text-purple-600" />
                  Today's Departures
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">{effectiveDepartures.length}</Badge>
              </CardHeader>
              <CardContent className="pt-0 max-h-64 overflow-y-auto">
                {effectiveDepartures.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No departures today</p>
                ) : effectiveDepartures.map((b: BookingRow) => {
                  const propName = isPortfolioMode ? (portfolioProperties || []).find(p => p.id === b.property_id)?.name : null;
                  const roomNames = getBookingRoomNames(b);
                  const canCheckOut = b.status === "checked_in";
                  const isQuickLoading = quickAction?.bookingId === b.id;
                  return (
                    <div key={b.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
                      <button
                        className="text-sm font-medium text-left hover:underline truncate flex-1 min-w-0"
                        onClick={() => openBookingSheet(b)}
                      >
                        <span className="block truncate">{b.guest_name}</span>
                        <span className="block text-[10px] text-muted-foreground truncate">
                          {propName && <span>{propName}</span>}
                          {propName && roomNames.length > 0 && <span> · </span>}
                          {roomNames.length > 0 && <span>{roomNames.join(", ")}</span>}
                          {!propName && roomNames.length === 0 && <span>No room assigned</span>}
                        </span>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px] capitalize">{b.status.replace(/_/g, " ")}</Badge>
                        {canCheckOut && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-6 text-[10px] px-2 py-0"
                            title="Review charges, confirm payment, then check out"
                            onClick={() => openBookingSheet(b)}
                          >
                            <LogOut className="h-3 w-3 mr-1" />
                            Review &amp; Check Out
                          </Button>
                        )}

                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            )}

          </div>
        )}

        {/* Recent reservations — expanded from the "Recent" counter */}
        {openPanel === "recent" && !isPortfolioMode && recentBookings.length > 0 && (

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-primary" />
                Recent Reservations
              </CardTitle>
              <Badge variant="secondary" className="text-[10px]">{recentBookings.length}</Badge>
            </CardHeader>
            <CardContent className="pt-0 max-h-72 overflow-y-auto">
              {recentBookings.map((b: BookingRow) => {
                const roomNames = getBookingRoomNames(b);
                return (
                  <div key={b.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
                    <button
                      className="text-sm font-medium text-left hover:underline truncate flex-1 min-w-0"
                      onClick={() => openBookingSheet(b)}
                    >
                      <span className="block truncate">{b.guest_name}</span>
                      <span className="block text-[10px] text-muted-foreground truncate">
                        {format(parseISO(b.check_in_date), "d MMM")} – {format(parseISO(b.check_out_date), "d MMM yyyy")}
                        {roomNames.length > 0 && <> · {roomNames.join(", ")}</>}
                      </span>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {b.payment_status === "paid" && (
                        <Badge variant="secondary" className="text-[10px]">Paid</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] capitalize">{b.status.replace(/_/g, " ")}</Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}


        {/* Urgent housekeeping alert */}
        {urgentRooms.length > 0 && (
          <Card className="border-amber-500/50 bg-amber-500/10">
            <CardContent className="p-3 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold text-warning dark:text-amber-400">Housekeeping Alert</p>
                {urgentRooms.map((u) => (
                  <p key={u.room.id} className="text-sm text-foreground">
                    <span className="font-medium">{u.room.room_name || u.room.room_number}</span> is {u.issue} — guest <span className="font-medium">{u.guestName}</span> checking in today
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Calendar controls — matching admin style */}
        <Card>
          <CardContent className="p-3">
            {/* Top bar: date range, actions, navigation */}
            <div className="flex flex-wrap gap-2 mb-3">
              <Button size="sm" onClick={() => setManualBookingOpen(true)} className="h-7 text-xs px-2">
                <Plus className="h-3 w-3 mr-1" />New Booking
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2">
                    <Settings2 className="h-3 w-3 mr-1" />Restrictions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 bg-popover">
                  <DropdownMenuItem onClick={() => { setFocusBlock(null); setManageRestrictionsOpen(true); }}>
                    <Settings2 className="mr-2 h-3 w-3" />Manage existing…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setStopSellOpen(true)}>
                    <div className="w-2 h-2 rounded-full bg-red-500 mr-2" />Stop Sell
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMinStayOpen(true)}>
                    <div className="w-2 h-2 rounded-full bg-blue-500 mr-2" />Min Stay
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMaxStayOpen(true)}>
                    <div className="w-2 h-2 rounded-full bg-pink-500 mr-2" />Max Stay
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLeadDaysAdvanceOpen(true)}>
                    <div className="w-2 h-2 rounded-full bg-yellow-500 mr-2" />Lead Days Advance
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLeadDaysPostOpen(true)}>
                    <div className="w-2 h-2 rounded-full bg-orange-500 mr-2" />Lead Days Post
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex w-full flex-wrap items-center gap-1 sm:ml-auto sm:w-auto sm:flex-nowrap sm:justify-end">
                <Button variant="outline" size="icon" onClick={() => navigateBy(-1)} className="h-7 w-7">
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="text-xs sm:text-sm font-semibold min-w-0 sm:min-w-[160px] text-center whitespace-nowrap">
                  {format(dateRange.start, "d MMM")} – {format(dateRange.end, "d MMM yyyy")}
                </span>
                <Button variant="outline" size="icon" onClick={() => navigateBy(1)} className="h-7 w-7">
                  <ChevronRight className="h-3 w-3" />
                </Button>
                <Button variant="outline" onClick={goToToday} className="h-7 text-xs px-2">Today</Button>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-7 text-xs px-2">
                      <CalendarDays className="h-3 w-3 mr-1" />Jump
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={anchorDate}
                      onSelect={(d) => { if (d) { setAnchorDate(d); setDatePickerOpen(false); } }}
                    />
                  </PopoverContent>
                </Popover>
                <div className="flex gap-0.5 ml-1">
                  {!isMobile && (
                    <Button
                      variant={viewMode === "roomplan" ? "default" : "outline"}
                      onClick={() => setViewMode("roomplan")}
                      className="h-7 text-xs px-2"
                    >Room Plan</Button>
                  )}
                  <Button
                    variant={viewMode === "week" ? "default" : "outline"}
                    onClick={() => setViewMode("week")}
                    className="h-7 text-xs px-2"
                  >Week</Button>
                  <Button
                    variant={viewMode === "month" ? "default" : "outline"}
                    onClick={() => setViewMode("month")}
                    className="h-7 text-xs px-2"
                  >Month</Button>
                </div>
                {(
                  <Button
                    variant={showOnlyBookedDays ? "default" : "outline"}
                    onClick={() => setShowOnlyBookedDays((value) => !value)}
                    className="h-7 text-xs px-2"
                    title={showOnlyBookedDays ? "Showing only booked days" : "Show only booked days"}
                  >
                    <EyeOff className="h-3 w-3 mr-1" />Booked days
                  </Button>
                )}
                {/* Legend — tucked into a popover so it costs no vertical space */}
                <Popover open={legendOpen} onOpenChange={setLegendOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-7 text-xs px-2" title="Colour legend">
                      <Info className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 p-3">
                    <div className="flex flex-col gap-1.5 text-xs">
                      <span className="font-medium text-muted-foreground">Bookings</span>
                      {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                        <div key={status} className="flex items-center gap-2">
                          <div className={cn("w-4 h-1.5 rounded-full", colors.bg, "border", colors.border)} />
                          <span className="capitalize text-muted-foreground">{status.replace("_", " ")}</span>
                        </div>
                      ))}
                      <span className="font-medium text-muted-foreground mt-1">Restrictions</span>
                      <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full bg-red-500" /><span className="text-muted-foreground">Stop Sell</span></div>
                      <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full bg-blue-500" /><span className="text-muted-foreground">Min Stay</span></div>
                      <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full bg-pink-500" /><span className="text-muted-foreground">Max Stay</span></div>
                      <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full bg-yellow-500" /><span className="text-muted-foreground">Lead Adv</span></div>
                      <div className="flex items-center gap-2"><div className="w-4 h-1.5 rounded-full bg-orange-500" /><span className="text-muted-foreground">Lead Post</span></div>
                      <div className="flex items-center gap-2"><AlertTriangle className="h-3 w-3 text-amber-500" /><span className="text-muted-foreground">Attention</span></div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {outsideWindowNotice && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  No stays in this window. This property has {outsideWindowNotice.total} booking
                  {outsideWindowNotice.total === 1 ? "" : "s"} on record — the nearest is{" "}
                  {format(parseISO(outsideWindowNotice.target), "d MMM yyyy")}.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setAnchorDate(parseISO(outsideWindowNotice.target))}
                >
                  Jump to {format(parseISO(outsideWindowNotice.target), "MMM yyyy")}
                </Button>
              </div>
            )}


            {viewMode === "roomplan" && (
              <p className="mb-2 text-[11px] text-muted-foreground">
                Drag a reservation to move it, or drag across empty nights to start a new booking. Hover for details.
              </p>
            )}

            {/* Calendar Grid */}
            {viewMode === "roomplan" ? (
              isPortfolioMode ? (
                <div className="space-y-4">
                  {(portfolioProperties || []).map((prop) => {
                    const propData = portfolioDataByProperty.get(prop.id);
                    if (!propData || propData.roomTypes.length === 0) return null;
                    const planBookedView = portfolioBookedViewByProperty.get(prop.id);
                    const planDates = showOnlyBookedDays ? (planBookedView?.visibleDates || []) : dates;
                    const planRoomTypes = showOnlyBookedDays
                      ? (planBookedView?.visibleRoomTypes || [])
                      : propData.roomTypes;
                    if (planDates.length === 0 || planRoomTypes.length === 0) return null;
                    return (
                      <div key={prop.id}>
                        <div className="flex items-center gap-2 mb-1.5 px-1 py-1 bg-muted/30 rounded-md">
                          <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                          <h3 className="text-xs font-semibold text-foreground">{prop.name}</h3>
                        </div>
                        <RoomPlanGrid
                          dates={planDates}
                          roomTypes={planRoomTypes}
                          roomsByType={propData.roomsByType}
                          bookings={propData.bookings as unknown as RoomPlanBooking[]}
                          propertyName={prop.name}
                          isHoliday={getHolidayName}
                          getRateForDate={(rtId, date) => getPortfolioRateForDate(prop.id, rtId, date)}
                          isBlocked={portfolioIsBlockedByProperty.get(prop.id)}
                          onEditBlock={openBlockEditor(planRoomTypes, prop.id)}
                          onSelectBooking={(b) => openBookingSheet(b as unknown as BookingRow)}
                          onQuickAction={(b, action) => handleQuickAction(b as unknown as BookingRow, action)}
                          onModifyBooking={(b) => setModifyTarget(b as unknown as BookingRow)}
                          onCancelBooking={(b, ctx) => { setCancelUnit(ctx ?? null); setCancelTarget(b as unknown as BookingRow); }}
                          unitLinesByBooking={linesByBooking}
                          onCreateBooking={(payload) => handleRoomPlanCreate({ ...payload, propertyId: prop.id })}
                          onMoveBooking={handleRoomPlanMove}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : showOnlyBookedDays && (visibleDates.length === 0 || visibleRoomTypes.length === 0) ? (
                <div className="flex items-center justify-center rounded-lg border bg-muted/20 py-10 text-sm text-muted-foreground">
                  No booked days in this period.
                </div>
              ) : (
                <RoomPlanGrid
                  dates={visibleDates}
                  roomTypes={visibleRoomTypes}
                  roomsByType={roomsByType}
                  bookings={bookings as unknown as RoomPlanBooking[]}
                  groupBlocks={groupBlocks}
                  propertyName={displayName}
                  bookingsLoading={bookingsLoading}
                  isHoliday={getHolidayName}
                  getRateForDate={getRateForDate}
                  isBlocked={isRoomTypeBlocked}
                  onEditBlock={openBlockEditor(visibleRoomTypes, propertyId)}
                  onSelectBooking={(b) => openBookingSheet(b as unknown as BookingRow)}
                  onQuickAction={(b, action) => handleQuickAction(b as unknown as BookingRow, action)}
                  onModifyBooking={(b) => setModifyTarget(b as unknown as BookingRow)}
                  onCancelBooking={(b, ctx) => { setCancelUnit(ctx ?? null); setCancelTarget(b as unknown as BookingRow); }}
                          unitLinesByBooking={linesByBooking}
                  onCreateBooking={handleRoomPlanCreate}
                  onMoveBooking={handleRoomPlanMove}
                />
              )
            ) : isPortfolioMode ? (

              viewMode === "week" ? (
                <div className="space-y-3">
                  {showOnlyBookedDays && !portfolioHasAnyBookedDay && (
                    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground border rounded-lg bg-muted/20">
                      No booked days in this week.
                    </div>
                  )}
                  {(portfolioProperties || []).map(prop => {
                    const propData = portfolioDataByProperty.get(prop.id);
                    if (!propData || propData.roomTypes.length === 0) return null;
                    const bookedView = portfolioBookedViewByProperty.get(prop.id);
                    const portfolioWeekDates = showOnlyBookedDays ? (bookedView?.visibleDates || []) : dates;
                    const propRoomTypes = showOnlyBookedDays ? (bookedView?.visibleRoomTypes || []) : propData.roomTypes;
                    if (portfolioWeekDates.length === 0 || propRoomTypes.length === 0) return null;
                    const propGetRate = (rtId: string, date: Date) => getPortfolioRateForDate(prop.id, rtId, date);
                    const propGetSuffix = () => '';
                    const propGetRestriction = (rtName: string, date: Date) =>
                      propData.overrideMap.get(`${rtName}-${format(date, "yyyy-MM-dd")}`);

                    const displayedRoomCount = new Set(Array.from(propData.roomsByType.values()).flat().map((room) => room.id)).size || propData.rooms.length;

                    return (
                      <div key={prop.id}>
                        <div className="flex items-center gap-2 mb-2 px-1 py-1.5 bg-muted/30 rounded-md">
                          <Building2 className="h-4 w-4 text-primary shrink-0" />
                          <h3 className="text-sm font-bold text-foreground">{prop.name}</h3>
                          <Badge variant="outline" className="text-[10px]">
                            {propRoomTypes.length} types · {displayedRoomCount} rooms
                          </Badge>
                        </div>
                        <WeekCalendarGrid
                          dates={portfolioWeekDates}
                          roomTypes={propRoomTypes}
                          roomsByType={propData.roomsByType}

                          bookings={propData.bookings}
                          rooms={propData.rooms}
                          overrideMap={propData.overrideMap}
                          getRateForDate={propGetRate}
                          getPricingSuffix={propGetSuffix}
                          getSeasonForDate={getSeasonForDate}
                          getRestriction={propGetRestriction}
                          onSelectBooking={openBookingSheet}
                          onEditBlock={openBlockEditor(propRoomTypes, prop.id)}
                          bookingsLoading={false}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Portfolio + month view: every property stacked tightly on one continuous axis
                <div className="space-y-3">
                  {showOnlyBookedDays && !portfolioHasAnyBookedDay && (
                    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground border rounded-lg bg-muted/20">
                      No booked days in this month.
                    </div>
                  )}
                  {(portfolioProperties || []).map(prop => {
                    const propData = portfolioDataByProperty.get(prop.id);
                    if (!propData || propData.roomTypes.length === 0) return null;
                    const bookedView = portfolioBookedViewByProperty.get(prop.id);
                    const monthDates = weekChunks.flat();
                    const propDates = showOnlyBookedDays
                      ? (() => {
                          const bookedKeys = new Set((bookedView?.visibleDates || []).map((date) => format(date, "yyyy-MM-dd")));
                          return monthDates.filter((date) => bookedKeys.has(format(date, "yyyy-MM-dd")));
                        })()
                      : monthDates;
                    const propRoomTypes = showOnlyBookedDays ? (bookedView?.visibleRoomTypes || []) : propData.roomTypes;
                    if (propDates.length === 0 || propRoomTypes.length === 0) return null;
                    const propGetRate = (rtId: string, date: Date) => getPortfolioRateForDate(prop.id, rtId, date);
                    const propGetSuffix = () => '';
                    const propGetRestriction = (rtName: string, date: Date) =>
                      propData.overrideMap.get(`${rtName}-${format(date, "yyyy-MM-dd")}`);
                    const displayedRoomCount = new Set(Array.from(propData.roomsByType.values()).flat().map((room) => room.id)).size || propData.rooms.length;

                    return (
                      <div key={prop.id}>
                        <div className="flex items-center gap-2 mb-1 px-1 py-1 bg-muted/30 rounded-md">
                          <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                          <h3 className="text-xs font-semibold text-foreground">{prop.name}</h3>
                          <Badge variant="outline" className="text-[10px]">
                            {propRoomTypes.length} types · {displayedRoomCount} rooms
                          </Badge>
                        </div>
                        <MonthCalendarGrid
                          weekChunks={[propDates]}
                          roomTypes={propRoomTypes}
                          roomsByType={propData.roomsByType}
                          bookings={propData.bookings}
                          rooms={propData.rooms}
                          overrideMap={propData.overrideMap}
                          getRateForDate={propGetRate}
                          getPricingSuffix={propGetSuffix}
                          getSeasonForDate={getSeasonForDate}
                          getRestriction={propGetRestriction}
                          onSelectBooking={openBookingSheet}
                          onEditBlock={openBlockEditor(propRoomTypes, prop.id)}
                          bookingsLoading={false}
                        />
                      </div>
                    );
                  })}
                </div>
              )
            ) : viewMode === "week" ? (
              showOnlyBookedDays && (visibleDates.length === 0 || visibleRoomTypes.length === 0) ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground border rounded-lg bg-muted/20">
                  No booked days in this week.
                </div>
              ) : (
              <WeekCalendarGrid
                dates={visibleDates}
                roomTypes={visibleRoomTypes}
                roomsByType={roomsByType}
                bookings={bookings}
                rateSeasons={rateSeasons}
                ratePrices={ratePrices}
                rooms={rooms}
                overrideMap={overrideMap}
                getRateForDate={getRateForDate}
                getPricingSuffix={getPricingSuffix}
                getSeasonForDate={getSeasonForDate}
                getRestriction={getRestriction}
                onSelectBooking={openBookingSheet}
                onEditBlock={openBlockEditor(visibleRoomTypes, propertyId)}
                bookingsLoading={bookingsLoading}
              />
              )
            ) : showOnlyBookedDays && (visibleWeekChunks.length === 0 || visibleRoomTypes.length === 0) ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground border rounded-lg bg-muted/20">
                No booked days in this month.
              </div>
            ) : (
              <MonthCalendarGrid
                weekChunks={visibleWeekChunks}
                roomTypes={visibleRoomTypes}
                roomsByType={roomsByType}

                bookings={bookings}
                rooms={rooms}
                overrideMap={overrideMap}
                getRateForDate={getRateForDate}
                getPricingSuffix={getPricingSuffix}
                getSeasonForDate={getSeasonForDate}
                getRestriction={getRestriction}
                onSelectBooking={openBookingSheet}
                onEditBlock={openBlockEditor(visibleRoomTypes, propertyId)}
                bookingsLoading={bookingsLoading}
              />
            )}
          </CardContent>
        </Card>

      </div>

      {/* Booking Detail Sheet */}
      <Sheet open={!!selectedBooking} onOpenChange={(open) => !open && closeBookingSheet()}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          {selectedBooking && <BookingDetail booking={selectedBooking} rooms={selectedBookingRooms} propertyId={selectedBookingPropertyId} activeTab={bookingSheetTab} onTabChange={setBookingSheetTab} onSaved={() => { closeBookingSheet(); queryClient.invalidateQueries({ queryKey: ["pms-cal-bookings"] }); queryClient.invalidateQueries({ queryKey: ["pms-portfolio-bookings"] }); queryClient.invalidateQueries({ queryKey: ["pms-arrivals"] }); queryClient.invalidateQueries({ queryKey: ["pms-departures"] }); queryClient.invalidateQueries({ queryKey: ["pms-cal-rooms"] }); }} />}
        </SheetContent>
      </Sheet>

      {/* Hover-card actions from the room plan: modify / cancel without opening the sheet */}
      {modifyTarget && (
        <BookingModifyDialog
          key={`modify-${modifyTarget.id}`}
          open={!!modifyTarget}
          onOpenChange={(open) => { if (!open) setModifyTarget(null); }}
          booking={{
            id: modifyTarget.id,
            guest_name: modifyTarget.guest_name,
            check_in_date: modifyTarget.check_in_date,
            check_out_date: modifyTarget.check_out_date,
            updated_at: modifyTarget.updated_at ?? null,
            adults: modifyTarget.adults,
            children: modifyTarget.children,
            teens: modifyTarget.teens,
            infants: modifyTarget.infants,
            total_price: modifyTarget.total_price,
            property_id: modifyTarget.property_id ?? null,
            room_type_id: modifyTarget.room_type_id ?? null,
          }}
          isRuBooking={isRuSourcedBooking(modifyTarget)}
          onDone={() => { setModifyTarget(null); refreshBookingQueries(); }}
        />
      )}
      {cancelTarget && (
        <BookingCancelDialog
          key={`cancel-${cancelTarget.id}`}
          open={!!cancelTarget}
          onOpenChange={(open) => { if (!open) { setCancelTarget(null); setCancelUnit(null); } }}
          bookingId={cancelTarget.id}
          guestName={cancelTarget.guest_name}
          isRuBooking={isRuSourcedBooking(cancelTarget)}
          isRuLead={isRuLeadOrigin(cancelTarget)}
          unitLineId={cancelUnit?.lineId ?? null}
          unitLabel={cancelUnit?.roomLabel ?? null}
          unitCount={cancelUnit?.unitCount ?? 1}
          onDone={() => { setCancelTarget(null); setCancelUnit(null); refreshBookingQueries(); }}
        />
      )}

      {/* Manual Booking Dialog */}
      <GuestCheckInDialog
        open={!!checkInBookingId}
        onOpenChange={(open) => { if (!open) setCheckInBookingId(null); }}
        bookingId={checkInBookingId}
      />

      <ManualBookingDialog
        open={manualBookingOpen}
        onOpenChange={(next) => { setManualBookingOpen(next); if (!next) setRoomPlanPrefill(null); }}
        initialValues={roomPlanPrefill}

        propertyId={propertyId || ""}
        roomTypes={roomTypes}
        rooms={rooms}
        ratePlans={ratePlansWithRate}
        getRateForDate={getRateForDate}
        getRateForPropertyDate={getPortfolioRateForDate}

        portfolioOptions={isPortfolioMode ? (portfolioProperties || []).map(p => {
          const pd = portfolioDataByProperty.get(p.id);
          return { id: p.id, name: p.name, roomTypes: pd?.roomTypes || [], rooms: pd?.rooms || [] };
        }) : undefined}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["pms-cal-bookings"] });
          queryClient.invalidateQueries({ queryKey: ["pms-portfolio-bookings"] });
          queryClient.invalidateQueries({ queryKey: ["pms-cal-rooms"] });
          queryClient.invalidateQueries({ queryKey: ["pms-arrivals"] });
          queryClient.invalidateQueries({ queryKey: ["pms-departures"] });
          // Force the calendar's infinite query to reload its first page immediately.
          queryClient.refetchQueries({ queryKey: ["pms-cal-bookings", propertyId] });
        }}
      />


      {/* Restriction Dialogs */}
      {(() => {
        const scopePortfolio = isPortfolioMode
          ? (portfolioProperties || []).map(p => ({ id: p.id, name: p.name }))
          : undefined;
        const scopeRoomTypesByProperty = isPortfolioMode
          ? Object.fromEntries(
              (portfolioProperties || []).map(p => {
                const d = portfolioDataByProperty.get(p.id);
                return [
                  p.id,
                  (d?.roomTypes || []).map(rt => ({
                    name: rt.name,
                    id: rt.id,
                    units: (d?.roomsByType.get(rt.id) || []).length,
                  })),
                ];
              })
            )
          : undefined;
        return (
          <>
            <BulkStopSellDialog open={stopSellOpen} onOpenChange={setStopSellOpen} propertyId={propertyId || undefined} propertyName={displayName} roomTypes={dialogRoomTypes} portfolioProperties={scopePortfolio} roomTypesByProperty={scopeRoomTypesByProperty} onRuleCreated={handleRuleCreated} />
            <BulkMinimumStayDialog open={minStayOpen} onOpenChange={setMinStayOpen} propertyId={propertyId || undefined} propertyName={displayName} roomTypes={dialogRoomTypes} portfolioProperties={scopePortfolio} roomTypesByProperty={scopeRoomTypesByProperty} onRuleCreated={handleRuleCreated} />
            <BulkMaximumStayDialog open={maxStayOpen} onOpenChange={setMaxStayOpen} propertyId={propertyId || undefined} propertyName={displayName} roomTypes={dialogRoomTypes} portfolioProperties={scopePortfolio} roomTypesByProperty={scopeRoomTypesByProperty} onRuleCreated={handleRuleCreated} />
            <BulkLeadDaysAdvanceDialog open={leadDaysAdvanceOpen} onOpenChange={setLeadDaysAdvanceOpen} propertyId={propertyId || undefined} propertyName={displayName} roomTypes={dialogRoomTypes} portfolioProperties={scopePortfolio} roomTypesByProperty={scopeRoomTypesByProperty} onRuleCreated={handleRuleCreated} />
            <BulkLeadDaysPostDialog open={leadDaysPostOpen} onOpenChange={setLeadDaysPostOpen} propertyId={propertyId || undefined} propertyName={displayName} roomTypes={dialogRoomTypes} portfolioProperties={scopePortfolio} roomTypesByProperty={scopeRoomTypesByProperty} onRuleCreated={handleRuleCreated} />
            <RestrictionsManagerDialog
              open={manageRestrictionsOpen}
              onOpenChange={(v) => { setManageRestrictionsOpen(v); if (!v) setFocusBlock(null); }}
              propertyIds={
                isPortfolioMode
                  ? (portfolioProperties || []).map((p) => p.id)
                  : propertyId
                    ? [propertyId]
                    : []
              }
              propertyNames={Object.fromEntries((portfolioProperties || []).map((p) => [p.id, p.name]))}
              windowStart={dateRange.start}
              focusBlock={focusBlock}
              onChanged={handleRuleCreated}
            />
          </>
        );
      })()}

    </>
  );
}

// ──────────── Week Calendar (horizontal scroll, original layout) ────────────
interface CalendarGridProps {
  dates?: Date[];
  weekChunks?: Date[][];
  roomTypes: RoomType[];
  roomsByType: Map<string, Room[]>;
  bookings: BookingRow[];
  rooms: Room[];
  rateSeasons?: RateSeason[];
  ratePrices?: RatePrice[];
  overrideMap: Map<string, AvailabilityOverride>;
  getRateForDate: (roomTypeId: string, date: Date) => number | null;
  getPricingSuffix: (roomTypeId: string) => string;
  getSeasonForDate: (date: Date) => RateSeason | null;
  getRestriction: (roomTypeName: string, date: Date) => AvailabilityOverride | undefined;
  onSelectBooking: (b: BookingRow, tab?: BookingDetailTab) => void;
  /** Right-click a blocked night → open the restriction editor for that span. */
  onEditBlock?: (roomTypeId: string, date: Date) => void;
  bookingsLoading: boolean;
}

const WEEK_CELL_W = "w-[56px] min-w-[56px]";
/** Compact month-grid density (px) for the continuous horizontal axis. */
const MONTH_CELL_PX = 56;
const MONTH_LABEL_PX = 150;
const WEEK_LABEL_W = "w-[160px] min-w-[160px]";

// ──────────── Shared: Date header cell ────────────
function DateHeaderCell({ date, season, className: extraClass }: { date: Date; season?: RateSeason | null; className?: string }) {
  const holiday = getHolidayName(date);
  const weekend = isWeekendDay(date);
  const today = isToday(date);

  const cellContent = (
    <div className={cn(
      "px-0.5 py-1.5 text-center",
      today ? "bg-primary/15 ring-1 ring-inset ring-primary/40" : holiday ? "bg-success-surface dark:bg-green-950/20" : weekend ? "bg-red-50/60 dark:bg-red-950/15" : "",
      extraClass,
    )}>
      <div className={cn("text-[10px] font-semibold uppercase", today ? "text-primary" : holiday ? "text-success dark:text-green-400" : weekend ? "text-red-500" : "text-muted-foreground")}>
        {format(date, "EEE")}
      </div>
      <div className={cn("text-sm font-bold", today ? "text-primary" : holiday ? "text-success dark:text-green-400" : weekend ? "text-red-500" : "text-foreground")}>
        {format(date, "d")}
      </div>
      <div className={cn("text-[9px]", today ? "text-primary" : holiday ? "text-success dark:text-green-400" : weekend ? "text-red-500" : "text-muted-foreground")}>
        {format(date, "MMM")}
      </div>
      {today && <div className="text-[7px] font-bold text-primary mt-0.5">TODAY</div>}
      {holiday && !today && <div className="text-[7px] font-semibold text-success dark:text-green-400 mt-0.5 animate-pulse-glow truncate max-w-[4.5rem] mx-auto leading-tight" title={holiday}>{holiday}</div>}
      {season?.is_peak && !today && !holiday && <div className="text-[7px] text-warning font-medium mt-0.5">PEAK</div>}
    </div>
  );

  if (holiday) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cellContent}</TooltipTrigger>
        <TooltipContent><p className="font-semibold text-xs">{holiday}</p><p className="text-[10px] text-muted-foreground">SA Public Holiday</p></TooltipContent>
      </Tooltip>
    );
  }
  return cellContent;
}

// ──────────── Shared: Restriction colored lines ────────────
function RestrictionLines({ restriction, prevRestriction, nextRestriction, date }: {
  restriction: AvailabilityOverride | undefined;
  prevRestriction?: AvailabilityOverride | undefined;
  nextRestriction?: AvailabilityOverride | undefined;
  date?: Date;
}) {
  if (!restriction) return null;
  const lines: JSX.Element[] = [];

  const getLineClass = (hasPrev: boolean, hasNext: boolean, baseColor: string) => {
    const rounded = hasPrev && hasNext ? "" : hasPrev ? "rounded-r-full" : hasNext ? "rounded-l-full" : "rounded-full";
    return `h-1 flex-1 ${baseColor} ${rounded}`;
  };

  if (isBlockedOverride(restriction)) {
    const tooltip = date
      ? formatBlockedTooltip(date, blockDetailOf(restriction))
      : "Blocked — not sellable on this night";
    lines.push(
      <Tooltip key="ss">
        <TooltipTrigger asChild>
          <div className={getLineClass(isBlockedOverride(prevRestriction), isBlockedOverride(nextRestriction), "bg-red-500")} />
        </TooltipTrigger>
        <TooltipContent>
          {tooltip.split("\n").map((line, i) => (
            <p key={i} className={cn("text-xs", i === 0 ? "font-medium" : "text-muted-foreground")}>{line}</p>
          ))}
        </TooltipContent>
      </Tooltip>
    );
  }
  if (restriction.minimum_stay != null) {
    const sameVal = (r?: AvailabilityOverride) => r?.minimum_stay === restriction.minimum_stay;
    lines.push(
      <Tooltip key="min">
        <TooltipTrigger asChild>
          <div className={cn(getLineClass(sameVal(prevRestriction), sameVal(nextRestriction), "bg-blue-500"), "flex items-center justify-center")}>
            <span className="text-[7px] text-white font-bold leading-none">{restriction.minimum_stay}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent><p className="text-xs font-medium">Min Stay: {restriction.minimum_stay} nights</p></TooltipContent>
      </Tooltip>
    );
  }
  if (restriction.maximum_stay != null) {
    const sameVal = (r?: AvailabilityOverride) => r?.maximum_stay === restriction.maximum_stay;
    lines.push(
      <Tooltip key="max">
        <TooltipTrigger asChild>
          <div className={cn(getLineClass(sameVal(prevRestriction), sameVal(nextRestriction), "bg-pink-500"), "flex items-center justify-center")}>
            <span className="text-[7px] text-white font-bold leading-none">{restriction.maximum_stay}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent><p className="text-xs font-medium">Max Stay: {restriction.maximum_stay} nights</p></TooltipContent>
      </Tooltip>
    );
  }
  if (restriction.lead_days_advance != null) {
    const sameVal = (r?: AvailabilityOverride) => r?.lead_days_advance === restriction.lead_days_advance;
    lines.push(
      <Tooltip key="adv">
        <TooltipTrigger asChild>
          <div className={getLineClass(sameVal(prevRestriction), sameVal(nextRestriction), "bg-yellow-500")} />
        </TooltipTrigger>
        <TooltipContent><p className="text-xs font-medium">Lead Advance: {restriction.lead_days_advance} days</p></TooltipContent>
      </Tooltip>
    );
  }
  if (restriction.lead_days_post != null) {
    const sameVal = (r?: AvailabilityOverride) => r?.lead_days_post === restriction.lead_days_post;
    lines.push(
      <Tooltip key="post">
        <TooltipTrigger asChild>
          <div className={getLineClass(sameVal(prevRestriction), sameVal(nextRestriction), "bg-orange-500")} />
        </TooltipTrigger>
        <TooltipContent><p className="text-xs font-medium">Lead Post: {restriction.lead_days_post} days</p></TooltipContent>
      </Tooltip>
    );
  }

  if (lines.length === 0) return null;
  return <div className="flex flex-col gap-0.5 w-full px-0.5 mt-0.5">{lines}</div>;
}

// ──────────── Shared: day cell background helper ────────────
function dateCellBg(date: Date, extraStop?: boolean) {
  const today = isToday(date);
  const holiday = !!getHolidayName(date);
  const weekend = isWeekendDay(date);
  if (extraStop) {
    return cn(
      "bg-red-500/5",
      "blocked-night-hatch",
      today && "ring-1 ring-inset ring-primary/40",
    );
  }
  if (today) return "bg-primary/5";
  if (holiday) return "bg-green-50/50 dark:bg-green-950/10";
  if (weekend) return "bg-red-50/30 dark:bg-red-950/10";
  return "";
}

function WeekCalendarGrid(props: CalendarGridProps) {
  const { dates = [], roomTypes, roomsByType, bookings, rooms, getRateForDate, getPricingSuffix, getSeasonForDate, getRestriction, onSelectBooking, onEditBlock, bookingsLoading } = props;

  const dailyOccupancy = useMemo(() => {
    const totalRooms = rooms.filter(r => r.status !== "out_of_service").length;
    if (!totalRooms) return dates.map(() => 0);
    return dates.map(date => {
      const dateStr = format(date, "yyyy-MM-dd");
      const occupied = bookings.filter(b => dateStr >= b.check_in_date && dateStr < b.check_out_date).length;
      return Math.round((occupied / totalRooms) * 100);
    });
  }, [dates, bookings, rooms]);

  return (
    <TooltipProvider>
      <div className="border rounded-lg overflow-hidden">
        <ScrollArea className="w-full">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              {/* Occupancy row */}
              <tr className="bg-muted/30">
                <th className="border p-1 min-w-[160px] sticky left-0 bg-muted/30 z-10 text-xs font-medium text-muted-foreground text-left px-3">Occupancy</th>
                {dates.map((date, i) => {
                  const occ = dailyOccupancy[i];
                  return (
                    <th key={i} className="border p-1 min-w-[80px]">
                      <div className="w-full bg-muted rounded-full h-1.5 mb-0.5">
                        <div className={cn("h-1.5 rounded-full transition-all", occ >= 90 ? "bg-green-500" : occ >= 60 ? "bg-blue-500" : occ >= 30 ? "bg-amber-500" : "bg-muted-foreground/20")} style={{ width: `${Math.min(occ, 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-normal">{occ}%</span>
                    </th>
                  );
                })}
              </tr>
              {/* Date header row */}
              <tr>
                <th className="border bg-muted/50 p-1 min-w-[160px] sticky left-0 bg-background z-10" />
                {dates.map((date, i) => {
                  const season = getSeasonForDate(date);
                  return (
                    <th key={i} className="border p-0 min-w-[80px]">
                      <DateHeaderCell date={date} season={season} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {roomTypes.map((rt) => (
                <RoomTypeSection key={rt.id} rt={rt} dates={dates} roomsByType={roomsByType} bookings={bookings} getRateForDate={getRateForDate} getPricingSuffix={getPricingSuffix} getRestriction={getRestriction} onSelectBooking={onSelectBooking} onEditBlock={onEditBlock} cellW={WEEK_CELL_W} labelW={WEEK_LABEL_W} />
              ))}
            </tbody>
          </table>
          {roomTypes.length === 0 && !bookingsLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <div className="text-center space-y-2">
                <CalendarDays className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm">No room types configured</p>
              </div>
            </div>
          )}
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}

// ──────────── Month Calendar (stacked weekly rows) ────────────
function MonthCalendarGrid(props: CalendarGridProps) {
  const { weekChunks = [], roomTypes, roomsByType, bookings, getRateForDate, getPricingSuffix, getSeasonForDate, getRestriction, onSelectBooking, onEditBlock, bookingsLoading } = props;
  // One continuous horizontal axis — travel sideways instead of stacking week blocks.
  const monthDates = useMemo(() => weekChunks.flat(), [weekChunks]);

  return (
    <TooltipProvider>
      <div className="border rounded-lg overflow-hidden">
        <ScrollArea className="w-full">
          <table className="w-full border-collapse" style={{ minWidth: MONTH_LABEL_PX + monthDates.length * MONTH_CELL_PX }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border bg-background p-1" style={{ width: MONTH_LABEL_PX, minWidth: MONTH_LABEL_PX }} />
                {monthDates.map((date, i) => {
                  const season = getSeasonForDate(date);
                  return (
                    <th key={i} className="border p-0" style={{ width: MONTH_CELL_PX, minWidth: MONTH_CELL_PX }}>
                      <DateHeaderCell date={date} season={season} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {roomTypes.map((rt) => {
                const typeRooms = roomsByType.get(rt.id) || [];
                const totalUnits = typeRooms.length || 1;

                const getMonthAvail = (date: Date) => {
                  const dateStr = format(date, "yyyy-MM-dd");
                  const booked = bookings.filter(b => {
                    if (b.room_type_id === rt.id || b.room_type_id === rt.linked_overview_id || b.rolos_room_ids?.some(rid => typeRooms.some(r => r.id === rid))) {
                      return dateStr >= b.check_in_date && dateStr < b.check_out_date && !["cancelled", "no_show"].includes(b.status);
                    }
                    return false;
                  }).length;
                  return { booked, avail: Math.max(0, totalUnits - booked) };
                };

                return (
                  <MonthRoomTypeRows
                    key={rt.id}
                    rt={rt}
                    weekDates={monthDates}
                    typeRooms={typeRooms}
                    bookings={bookings}
                    getRateForDate={getRateForDate}
                    getPricingSuffix={getPricingSuffix}
                    getRestriction={getRestriction}
                    getMonthAvail={getMonthAvail}
                    onSelectBooking={onSelectBooking}
                    onEditBlock={onEditBlock}
                  />
                );
              })}
            </tbody>
          </table>

          {roomTypes.length === 0 && !bookingsLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <div className="text-center space-y-2">
                <CalendarDays className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm">No room types configured</p>
              </div>
            </div>
          )}
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}

function MonthRoomTypeRows({ rt, weekDates, typeRooms, bookings, getRateForDate, getPricingSuffix, getRestriction, getMonthAvail, onSelectBooking, onEditBlock }: {
  rt: RoomType;
  weekDates: Date[];
  typeRooms: Room[];
  bookings: BookingRow[];
  getRateForDate: (roomTypeId: string, date: Date) => number | null;
  getPricingSuffix: (roomTypeId: string) => string;
  getRestriction: (roomTypeName: string, date: Date) => AvailabilityOverride | undefined;
  getMonthAvail: (date: Date) => { booked: number; avail: number };
  onSelectBooking: (b: BookingRow, tab?: BookingDetailTab) => void;
  onEditBlock?: (roomTypeId: string, date: Date) => void;
}) {
  const isSingleRoom = typeRooms.length <= 1;
  const singleRoom = typeRooms.length === 1 ? typeRooms[0] : null;
  const singleRoomOOS = singleRoom?.status === "out_of_service";

  return (
    <>
      {/* Room type header row (merged with booking bars for single-room types) */}
      <tr className={cn("bg-muted dark:bg-slate-800", isSingleRoom && singleRoomOOS && "opacity-50")}>
        <td className="border p-1 font-semibold text-xs text-foreground sticky left-0 bg-muted dark:bg-slate-800 z-10">
          <div className="flex items-center gap-1.5 px-1">
            <BedDouble className="h-3 w-3 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="truncate">{rt.name}</div>
              {!isSingleRoom && <div className="text-[9px] text-muted-foreground font-normal">{typeRooms.length} rooms</div>}
            </div>
          </div>
        </td>
        {weekDates.map((date, i) => {
          const rate = getRateForDate(rt.id, date);
          const restriction = getRestriction(rt.name, date);
          const prevRestriction = i > 0 ? getRestriction(rt.name, weekDates[i - 1]) : undefined;
          const nextRestriction = i < weekDates.length - 1 ? getRestriction(rt.name, weekDates[i + 1]) : undefined;
          const { booked, avail } = getMonthAvail(date);
          const dateStr = format(date, "yyyy-MM-dd");

          // For single-room types, also render booking bars in this cell
          const dayBookings = isSingleRoom && singleRoom && !singleRoomOOS
            ? bookings.filter(b => b.rolos_room_ids?.includes(singleRoom.id) && dateStr >= b.check_in_date && dateStr < b.check_out_date)
            : [];

          return (
            <td
              key={i}
              className={cn("border p-0 text-center relative", isSingleRoom ? "h-8" : "p-1", dateCellBg(date, isBlockedOverride(restriction)))}
              onContextMenu={(event) => {
                if (!onEditBlock || !isBlockedOverride(restriction)) return;
                event.preventDefault();
                onEditBlock(rt.id, date);
              }}
            >
              {isSingleRoom && singleRoomOOS ? (
                <div className="flex items-center justify-center h-full"><Ban className="h-3 w-3 text-muted-foreground/30" /></div>
              ) : (
                <>
                  {dayBookings.length === 0 && (
                    <div className={cn("flex flex-col items-center", isSingleRoom && "absolute inset-0 z-0 justify-center pointer-events-none")}>
                      {rate != null ? (
                        <span className="text-[10px] font-medium text-foreground">R{rate.toLocaleString()}{getPricingSuffix(rt.id)}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50 italic">—</span>
                      )}
                      {!isSingleRoom && (
                        <div className="text-[8px] font-semibold mt-0.5">
                          <span className={avail > 0 ? "text-success" : "text-red-500"}>{avail}</span>
                          {booked > 0 && <span className="text-muted-foreground"> / {booked}b</span>}
                        </div>
                      )}
                      <RestrictionLines restriction={restriction} prevRestriction={prevRestriction} nextRestriction={nextRestriction} date={date} />
                    </div>
                  )}
                  {/* Booking bars for single-room types */}
                  {dayBookings.map(b => {
                    const colors = getBookingColor(b);
                    const isStart = b.check_in_date === dateStr;
                    const isEnd = addDays(parseISO(b.check_out_date), -1).toISOString().slice(0, 10) === dateStr;
                    const showLabel = dateStr === getBookingLabelDate(b, weekDates);
                    return (
                      <Fragment key={b.id}>
                        <button title={getBookingBarTitle(b)} onClick={() => onSelectBooking(b)} onDoubleClick={() => onSelectBooking(b, "folio")} className={cn(
                        "absolute inset-y-0.5 border flex items-center px-1 overflow-hidden cursor-pointer hover:opacity-80 z-[1]",
                        colors.bg, colors.border,
                        isStart ? "left-1/2 rol-bar-half-in" : "left-0",
                        isEnd ? "right-[-50%] rol-bar-half-out" : "right-0"
                      )}>
                      </button>
                        {showLabel && <BookingBarLabel booking={b} textClass={colors.text} halfStart={isStart} />}
                      </Fragment>
                    );
                  })}

                </>
              )}
            </td>
          );
        })}
      </tr>

      {/* Individual room rows (only for multi-room types) */}
      {!isSingleRoom && typeRooms.map((room) => (
        <MonthRoomRow key={room.id} room={room} dates={weekDates} bookings={bookings} onSelectBooking={onSelectBooking} />
      ))}

      {/* Unassigned bookings */}
      {(() => {
        const unassigned = bookings.filter(b =>
          (b.room_type_id === rt.id || b.room_type_id === rt.linked_overview_id) && (!b.rolos_room_ids || b.rolos_room_ids.length === 0) &&
          weekDates.some(d => { const ds = format(d, "yyyy-MM-dd"); return ds >= b.check_in_date && ds < b.check_out_date; })
        );
        if (!unassigned.length) return null;
        return (
          <tr className="bg-amber-50/50 dark:bg-amber-950/10">
            <td className="border p-1 sticky left-0 bg-amber-50/50 dark:bg-amber-950/10 z-10">
              <span className="text-[10px] text-warning italic pl-5">Unassigned</span>
            </td>
            {weekDates.map((date, i) => {
              const dateStr = format(date, "yyyy-MM-dd");
              const dayBookings = bookings.filter(b =>
                (b.room_type_id === rt.id || b.room_type_id === rt.linked_overview_id) && (!b.rolos_room_ids || b.rolos_room_ids.length === 0) &&
                dateStr >= b.check_in_date && dateStr < b.check_out_date
              );
              return (
                <td key={i} className="border p-0 relative h-8">
                  {dayBookings.map(b => {
                    const colors = getBookingColor(b);
                    const isStart = b.check_in_date === dateStr;
                    const showLabel = dateStr === getBookingLabelDate(b, weekDates);
                    return (
                      <Fragment key={b.id}>
                        <button
                        onClick={() => onSelectBooking(b)}
                        onDoubleClick={() => onSelectBooking(b, "folio")}
                        title={`${getBookingBarTitle(b)} · ${b.status} — click to open, double-click for folio`}
                        className={cn("absolute inset-y-0.5 inset-x-0.5 rounded-sm border flex items-center gap-1 px-1 overflow-hidden cursor-pointer hover:opacity-90", colors.bg, colors.border)}
                      >
                      </button>
                        {showLabel && <BookingBarLabel booking={b} textClass={colors.text} />}
                      </Fragment>
                    );
                  })}

                </td>
              );
            })}
          </tr>
        );
      })()}
    </>
  );
}

// ──────────── Month Room Row (table row) ────────────
function MonthRoomRow({ room, dates, bookings, onSelectBooking }: {
  room: Room;
  dates: Date[];
  bookings: BookingRow[];
  onSelectBooking: (b: BookingRow, tab?: BookingDetailTab) => void;
}) {
  const isOOS = room.status === "out_of_service";

  return (
    <tr className={cn(isOOS && "opacity-50")}>
      <td className="border p-1 sticky left-0 bg-background z-10">
        <div className="flex items-center gap-1 pl-5">
          <span className="text-xs text-foreground/80">{room.room_number}</span>
          {room.room_name && <span className="text-[10px] text-muted-foreground truncate">({room.room_name})</span>}
          {isOOS && <Badge variant="outline" className="text-[7px] px-1 py-0 leading-none">OOS</Badge>}
        </div>
      </td>
      {dates.map((date, i) => {
        const dateStr = format(date, "yyyy-MM-dd");
        if (isOOS) {
          return <td key={i} className="border h-8 bg-muted/20"><div className="flex items-center justify-center h-full"><Ban className="h-3 w-3 text-muted-foreground/30" /></div></td>;
        }
        const dayBookings = bookings.filter(b => b.rolos_room_ids?.includes(room.id) && dateStr >= b.check_in_date && dateStr < b.check_out_date);
        return (
          <td key={i} className={cn("border p-0 relative h-8", dateCellBg(date))}>
            {dayBookings.map(b => {
              const colors = getBookingColor(b);
              const isStart = b.check_in_date === dateStr;
              const isEnd = addDays(parseISO(b.check_out_date), -1).toISOString().slice(0, 10) === dateStr;
              const showLabel = dateStr === getBookingLabelDate(b, dates);
              return (
                <Fragment key={b.id}>
                  <button title={getBookingBarTitle(b)} onClick={() => onSelectBooking(b)} onDoubleClick={() => onSelectBooking(b, "folio")} className={cn(
                  "absolute inset-y-0.5 border flex items-center px-1 overflow-hidden cursor-pointer hover:opacity-80 z-[1]",
                  colors.bg, colors.border,
                  isStart ? "left-1/2 rol-bar-half-in" : "left-0",
                  isEnd ? "right-[-50%] rol-bar-half-out" : "right-0"
                )}>
                </button>
                  {showLabel && <BookingBarLabel booking={b} textClass={colors.text} halfStart={isStart} />}
                </Fragment>
              );
            })}
          </td>
        );
      })}
    </tr>
  );
}

// ──────────── Room Type Section (for week view — table rows) ────────────
function RoomTypeSection({ rt, dates, roomsByType, bookings, getRateForDate, getPricingSuffix, getRestriction, onSelectBooking, onEditBlock, cellW, labelW }: {
  rt: RoomType;
  dates: Date[];
  roomsByType: Map<string, Room[]>;
  bookings: BookingRow[];
  getRateForDate: (roomTypeId: string, date: Date) => number | null;
  getPricingSuffix: (roomTypeId: string) => string;
  getRestriction: (roomTypeName: string, date: Date) => AvailabilityOverride | undefined;
  onSelectBooking: (b: BookingRow, tab?: BookingDetailTab) => void;
  onEditBlock?: (roomTypeId: string, date: Date) => void;
  cellW: string;
  labelW: string;
}) {
  const typeRooms = roomsByType.get(rt.id) || [];
  const totalUnits = typeRooms.length || 1;

  const getAvail = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const booked = bookings.filter(b => {
      if (b.room_type_id === rt.id || b.room_type_id === rt.linked_overview_id || b.rolos_room_ids?.some(rid => typeRooms.some(r => r.id === rid))) {
        return dateStr >= b.check_in_date && dateStr < b.check_out_date && !["cancelled", "no_show"].includes(b.status);
      }
      return false;
    }).length;
    return { booked, avail: Math.max(0, totalUnits - booked) };
  };

  const isSingleRoom = typeRooms.length <= 1;
  const singleRoom = typeRooms.length === 1 ? typeRooms[0] : null;
  const singleRoomOOS = singleRoom?.status === "out_of_service";

  return (
    <>
      {/* Room type header row (merged with booking bars for single-room types) */}
      <tr className={cn("bg-muted dark:bg-slate-800", isSingleRoom && singleRoomOOS && "opacity-50")}>
        <td className="border p-1 font-semibold text-xs text-foreground sticky left-0 bg-muted dark:bg-slate-800 z-10 min-w-[160px]">
          <div className="flex items-center gap-1.5 px-1">
            <BedDouble className="h-3 w-3 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="truncate">{rt.name}</div>
              {!isSingleRoom && <div className="text-[9px] text-muted-foreground font-normal">{typeRooms.length} rooms</div>}
            </div>
          </div>
        </td>
        {dates.map((date, i) => {
          const rate = getRateForDate(rt.id, date);
          const restriction = getRestriction(rt.name, date);
          const prevRestriction = i > 0 ? getRestriction(rt.name, dates[i - 1]) : undefined;
          const nextRestriction = i < dates.length - 1 ? getRestriction(rt.name, dates[i + 1]) : undefined;
          const { booked, avail } = getAvail(date);
          const dateStr = format(date, "yyyy-MM-dd");

          const dayBookings = isSingleRoom && singleRoom && !singleRoomOOS
            ? bookings.filter(b => b.rolos_room_ids?.includes(singleRoom.id) && dateStr >= b.check_in_date && dateStr < b.check_out_date)
            : [];

          return (
            <td
              key={i}
              className={cn("border p-0 text-center relative min-w-[80px]", isSingleRoom ? "h-8" : "p-1", dateCellBg(date, isBlockedOverride(restriction)))}
              onContextMenu={(event) => {
                if (!onEditBlock || !isBlockedOverride(restriction)) return;
                event.preventDefault();
                onEditBlock(rt.id, date);
              }}
            >
              {isSingleRoom && singleRoomOOS ? (
                <div className="flex items-center justify-center h-full"><Ban className="h-3 w-3 text-muted-foreground/30" /></div>
              ) : (
                <>
                  {dayBookings.length === 0 && (
                    <div className={cn("flex flex-col items-center", isSingleRoom && "absolute inset-0 z-0 justify-center pointer-events-none")}>
                      {rate != null ? (
                        <span className="text-[10px] font-medium text-foreground">R{rate.toLocaleString()}{getPricingSuffix(rt.id)}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50 italic">—</span>
                      )}
                      {!isSingleRoom && (
                        <div className="text-[8px] font-semibold mt-0.5">
                          <span className={avail > 0 ? "text-success" : "text-red-500"}>{avail}</span>
                          {booked > 0 && <span className="text-muted-foreground"> / {booked}b</span>}
                        </div>
                      )}
                      <RestrictionLines restriction={restriction} prevRestriction={prevRestriction} nextRestriction={nextRestriction} date={date} />
                    </div>
                  )}
                  {dayBookings.map(b => {
                    const colors = getBookingColor(b);
                    const isStart = b.check_in_date === dateStr;
                    const isEnd = addDays(parseISO(b.check_out_date), -1).toISOString().slice(0, 10) === dateStr;
                    const showLabel = dateStr === getBookingLabelDate(b, dates);
                    return (
                      <Fragment key={b.id}>
                        <button title={getBookingBarTitle(b)} onClick={() => onSelectBooking(b)} onDoubleClick={() => onSelectBooking(b, "folio")} className={cn(
                        "absolute inset-y-0.5 border flex items-center px-1 overflow-hidden cursor-pointer hover:opacity-80 z-[1]",
                        colors.bg, colors.border,
                        isStart ? "left-1/2 rol-bar-half-in" : "left-0",
                        isEnd ? "right-[-50%] rol-bar-half-out" : "right-0"
                      )}>
                      </button>
                        {showLabel && <BookingBarLabel booking={b} textClass={colors.text} halfStart={isStart} />}
                      </Fragment>
                    );
                  })}

                </>
              )}
            </td>
          );
        })}
      </tr>

      {/* Individual room rows (only for multi-room types) */}
      {!isSingleRoom && typeRooms.map((room) => (
        <WeekRoomRow key={room.id} room={room} dates={dates} bookings={bookings} onSelectBooking={onSelectBooking} />
      ))}
    </>
  );
}

// ──────────── Week Room Row (table row) ────────────
function WeekRoomRow({ room, dates, bookings, onSelectBooking }: {
  room: Room;
  dates: Date[];
  bookings: BookingRow[];
  onSelectBooking: (b: BookingRow, tab?: BookingDetailTab) => void;
}) {
  const isOOS = room.status === "out_of_service";

  return (
    <tr className={cn(isOOS && "opacity-50")}>
      <td className="border p-1 sticky left-0 bg-background z-10 min-w-[160px]">
        <div className="flex items-center gap-1 pl-5">
          <span className="text-xs text-foreground/80">{room.room_number}</span>
          {room.room_name && <span className="text-[10px] text-muted-foreground truncate">({room.room_name})</span>}
          {isOOS && <Badge variant="outline" className="text-[7px] px-1 py-0 leading-none">OOS</Badge>}
        </div>
      </td>
      {dates.map((date, i) => {
        const dateStr = format(date, "yyyy-MM-dd");
        if (isOOS) {
          return <td key={i} className="border h-8 min-w-[80px] bg-muted/20"><div className="flex items-center justify-center h-full"><Ban className="h-3 w-3 text-muted-foreground/30" /></div></td>;
        }
        const dayBookings = bookings.filter(b => b.rolos_room_ids?.includes(room.id) && dateStr >= b.check_in_date && dateStr < b.check_out_date);
        return (
          <td key={i} className={cn("border p-0 relative h-8 min-w-[80px]", dateCellBg(date))}>
            {dayBookings.map(b => {
              const colors = getBookingColor(b);
              const isStart = b.check_in_date === dateStr;
              const isEnd = addDays(parseISO(b.check_out_date), -1).toISOString().slice(0, 10) === dateStr;
              const showLabel = dateStr === getBookingLabelDate(b, dates);
              return (
                <Fragment key={b.id}>
                  <button title={getBookingBarTitle(b)} onClick={() => onSelectBooking(b)} onDoubleClick={() => onSelectBooking(b, "folio")} className={cn(
                  "absolute inset-y-0.5 border flex items-center px-1 overflow-hidden cursor-pointer hover:opacity-80 z-[1]",
                  colors.bg, colors.border,
                  isStart ? "left-1/2 rol-bar-half-in" : "left-0",
                  isEnd ? "right-[-50%] rol-bar-half-out" : "right-0"
                )}>
                </button>
                  {showLabel && <BookingBarLabel booking={b} textClass={colors.text} halfStart={isStart} />}
                </Fragment>
              );
            })}
          </td>
        );
      })}
    </tr>
  );
}

// ──────────── Booking Detail Component (Tabbed Lifecycle) ────────────

function BookingDetail({
  booking,
  rooms,
  propertyId,
  activeTab,
  onTabChange,
  onSaved,
}: {
  booking: BookingRow;
  rooms: Room[];
  propertyId: string;
  activeTab: BookingDetailTab;
  onTabChange: (tab: BookingDetailTab) => void;
  onSaved: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Room reassignment state
  const [showRoomReassign, setShowRoomReassign] = useState(false);
  const [unreadyRoomDetails, setUnreadyRoomDetails] = useState<any[]>([]);
  const [reassignRoomIds, setReassignRoomIds] = useState<string[]>([]);
  const [reassignPrice, setReassignPrice] = useState("");
  // Checkout confirmation state
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  // Cancel / modify dialogs — these route through the edge functions so channel-sourced
  // bookings (Rentals United) are withdrawn or amended at the channel first.
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showModifyDialog, setShowModifyDialog] = useState(false);

  const [form, setForm] = useState({
    guest_name: booking.guest_name,
    guest_email: booking.guest_email,
    guest_phone: booking.guest_phone || "",
    check_in_date: booking.check_in_date,
    check_out_date: booking.check_out_date,
    adults: String(booking.adults),
    children: String(booking.children ?? 0),
    teens: String(booking.teens ?? 0),
    infants: String(booking.infants ?? 0),
    pets: String(booking.pets ?? 0),
    total_price: String(booking.total_price),
    payment_status: booking.payment_status || "unpaid",
    payment_method: booking.payment_method || "",
    status: booking.status,
    special_requests: booking.special_requests || "",
  });
  // Track whether the user has manually edited the total so we don't overwrite it on date changes.
  const [totalManuallyEdited, setTotalManuallyEdited] = useState(false);
  const originalNights = Math.max(1, differenceInDays(parseISO(booking.check_out_date), parseISO(booking.check_in_date)));
  const originalNightlyRate = (booking.total_price || 0) / originalNights;

  const update = (key: string, value: string) => {
    setForm(p => {
      const next = { ...p, [key]: value };
      if (key === "total_price") {
        setTotalManuallyEdited(true);
      }
      // Auto-recalc total when dates change (unless user manually overrode it).
      if ((key === "check_in_date" || key === "check_out_date") && !totalManuallyEdited) {
        try {
          const ci = parseISO(next.check_in_date);
          const co = parseISO(next.check_out_date);
          const n = differenceInDays(co, ci);
          if (n > 0 && originalNightlyRate > 0) {
            next.total_price = String(Math.round(originalNightlyRate * n * 100) / 100);
          }
        } catch { /* ignore parse errors */ }
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("bookings").update({
      guest_name: form.guest_name,
      guest_email: form.guest_email,
      guest_phone: form.guest_phone || null,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      adults: parseInt(form.adults) || 1,
      children: parseInt(form.children) || 0,
      teens: parseInt(form.teens) || 0,
      infants: parseInt(form.infants) || 0,
      pets: parseInt(form.pets) || 0,
      total_price: parseFloat(form.total_price) || 0,
      payment_status: form.payment_status,
      payment_method: form.payment_method || null,
      status: form.status,
      special_requests: form.special_requests || null,
    }).eq("id", booking.id);
    setSaving(false);
    if (error) { toast.error("Failed to save: " + error.message); return; }
    toast("Booking updated successfully");
    setIsEditing(false);
    onSaved();
  };

  const handleLifecycleAction = async (action: string, extraPayload?: Record<string, any>) => {
    setActionLoading(action);
    try {
      if (action === "check_in" || action === "check_out") {
        const res = await callPmsApi(action, { booking_id: booking.id, ...extraPayload });
        if (!res.success) {
          // Handle ROOMS_NOT_READY: show reassignment dialog
          if (res.error?.code === "ROOMS_NOT_READY") {
            setUnreadyRoomDetails((res.error?.details as any)?.unready_rooms || []);
            setReassignRoomIds(booking.rolos_room_ids || []);
            setReassignPrice(String(booking.total_price));
            setShowRoomReassign(true);
            setActionLoading(null);
            return;
          }
          throw new Error(res.error?.message || "Action failed");
        }
      } else if (action === "mark_paid") {
        await supabase.from("bookings").update({ payment_status: "paid", status: "confirmed" }).eq("id", booking.id);
      } else if (action === "cancel") {
        await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
      } else if (action === "no_show") {
        await supabase.from("bookings").update({ status: "no_show" }).eq("id", booking.id);
      }
      /* Cancellations and no-shows drop out of the guest's history — refresh their totals. */
      if (["cancel", "no_show", "mark_paid"].includes(action) && booking.rolos_guest_id) {
        await rebuildGuestStats([booking.rolos_guest_id]);
      }
      toast.success(`Action "${action.replace("_", " ")}" completed`);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    }
    setActionLoading(null);
  };

  const handleReassignCheckIn = async () => {
    const overridePrice = parseFloat(reassignPrice);
    await handleLifecycleAction("check_in", {
      override_room_ids: reassignRoomIds,
      override_total_price: isNaN(overridePrice) ? undefined : overridePrice,
    });
    setShowRoomReassign(false);
  };

  const toggleReassignRoom = (roomId: string) => {
    setReassignRoomIds(prev =>
      prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]
    );
  };

  const b = booking;
  const nights = differenceInDays(parseISO(form.check_out_date), parseISO(form.check_in_date));
  const assignedRooms = rooms.filter(r => b.rolos_room_ids?.includes(r.id));
  const availableRooms = rooms.filter(r => r.status === "available");
  const guestId = b.rolos_guest_id || null;
  // Rentals United bookings must be cancelled/modified at the channel first.
  const isRuSourced = isRuSourcedBooking(b);
  const isRuLeadBooking = isRuLeadOrigin(b);


  // Lifecycle buttons based on status
  const renderLifecycleActions = () => {
    const btns: JSX.Element[] = [];
    const loading = (a: string) => actionLoading === a;
    
    // Show room readiness warning for confirmed bookings
    if (b.status === "confirmed" && assignedRooms.length > 0) {
      const unready = assignedRooms.filter(r => r.status !== "available" && r.status !== "occupied");
      if (unready.length > 0) {
        btns.push(
          <div key="room-warning" className="w-full bg-warning-surface dark:bg-amber-950/30 border border-warning-border dark:border-amber-800 rounded-md p-2 text-xs text-warning dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Room{unready.length > 1 ? "s" : ""} not ready: {unready.map(r => `${r.room_number} (${r.status})`).join(", ")}</span>
          </div>
        );
      }
    }

    // Channel enquiry (e.g. Rentals United lead): show hold expiry + auto-withdrawal dates.
    const hold = getHoldSummary(b);
    if (hold) {
      btns.push(
        <div key="hold-notice" className="w-full rounded-md border border-violet-500/40 bg-violet-500/10 p-2 text-xs flex items-start gap-2">
          <Clock className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <span className="font-medium">{hold.label}</span>
            <span className="block text-muted-foreground">{hold.detail}</span>
          </span>
        </div>
      );
    }

    if (b.status === "pending") {
      btns.push(
        <Button key="pay" size="sm" onClick={() => handleLifecycleAction("mark_paid")} disabled={!!actionLoading}>
          <CheckCircle className="h-3 w-3 mr-1" />{loading("mark_paid") ? "..." : "Mark Paid & Confirm"}
        </Button>,
        <Button key="checkin" size="sm" variant="secondary" onClick={() => handleLifecycleAction("check_in")} disabled={!!actionLoading}>
          <LogIn className="h-3 w-3 mr-1" />{loading("check_in") ? "..." : "Check In Now"}
        </Button>,
      );
      // Rentals United refuses Push_ModifyStay_RQ on unconfirmed requests (RU_MODIFY_NOT_ALLOWED),
      // so only offer Modify when the reservation is not a held channel request.
      if (!isRuLeadBooking) {
        btns.push(
          <Button key="modify" size="sm" variant="outline" onClick={() => setShowModifyDialog(true)} disabled={!!actionLoading}>
            <Pencil className="h-3 w-3 mr-1" />Modify
          </Button>,
        );
      }
      btns.push(
        <Button key="cancel" size="sm" variant="destructive" onClick={() => setShowCancelDialog(true)} disabled={!!actionLoading}>
          <XCircle className="h-3 w-3 mr-1" />{isRuLeadBooking ? "Reject" : "Cancel"}
        </Button>,
        <Button key="noshow" size="sm" variant="outline" onClick={() => handleLifecycleAction("no_show")} disabled={!!actionLoading}>
          <EyeOff className="h-3 w-3 mr-1" />No Show
        </Button>,
      );
    } else if (b.status === "confirmed") {
      btns.push(
        <Button key="checkin" size="sm" onClick={() => handleLifecycleAction("check_in")} disabled={!!actionLoading}>
          <LogIn className="h-3 w-3 mr-1" />{loading("check_in") ? "..." : "Check In"}
        </Button>,
        <Button key="modify" size="sm" variant="outline" onClick={() => setShowModifyDialog(true)} disabled={!!actionLoading}>
          <Pencil className="h-3 w-3 mr-1" />Modify
        </Button>,
        <Button key="cancel" size="sm" variant="destructive" onClick={() => setShowCancelDialog(true)} disabled={!!actionLoading}>
          <XCircle className="h-3 w-3 mr-1" />Cancel
        </Button>,
      );

    } else if (b.status === "checked_in") {
      btns.push(
        <Button key="checkout" size="sm" onClick={() => setShowCheckoutConfirm(true)} disabled={!!actionLoading}>
          <LogOut className="h-3 w-3 mr-1" />{loading("check_out") ? "..." : "Check Out"}
        </Button>,
      );
    }
    return (
      <>
        {btns.length > 0 ? <div className="flex flex-wrap gap-2 mt-2">{btns}</div> : null}
        <CheckoutConfirmationDialog
          open={showCheckoutConfirm}
          onOpenChange={setShowCheckoutConfirm}
          bookingId={booking.id}
          guestName={booking.guest_name}
          onConfirm={() => {
            setShowCheckoutConfirm(false);
            handleLifecycleAction("check_out");
          }}
        />
        <BookingCancelDialog
          open={showCancelDialog}
          onOpenChange={setShowCancelDialog}
          bookingId={booking.id}
          guestName={booking.guest_name}
          isRuBooking={isRuSourced}
          isRuLead={isRuLeadBooking}
          onDone={onSaved}
        />
        <BookingModifyDialog
          open={showModifyDialog}
          onOpenChange={setShowModifyDialog}
          booking={{
            id: booking.id,
            guest_name: booking.guest_name,
            check_in_date: booking.check_in_date,
            check_out_date: booking.check_out_date,
            adults: booking.adults,
            children: booking.children,
            teens: booking.teens,
            infants: booking.infants,
            total_price: booking.total_price,
            property_id: booking.property_id ?? null,
            room_type_id: booking.room_type_id ?? null,
            updated_at: (booking as { updated_at?: string | null }).updated_at ?? null,
          }}

          isRuBooking={isRuSourced}
          onDone={onSaved}
        />
      </>
    );

  };

  // Room reassignment dialog
  const renderRoomReassignDialog = () => {
    if (!showRoomReassign) return null;
    return (
      <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-4 space-y-3 mt-3">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Room(s) Not Ready — Reassign to Check In
        </div>
        {unreadyRoomDetails.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {unreadyRoomDetails.map((r: { id: string; room_number: string; status: string }) => (
              <span key={r.id} className="inline-flex items-center gap-1 mr-2">
                <BedDouble className="h-3 w-3" />{r.room_number}: <Badge variant="outline" className="text-xs">{r.status}</Badge>
              </span>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <label className="text-xs font-medium">Select Room(s)</label>
          <div className="flex flex-wrap gap-2">
            {rooms.map(r => {
              const selected = reassignRoomIds.includes(r.id);
              const isReady = r.status === "available";
              return (
                <Button
                  key={r.id}
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  className={cn("text-xs", !isReady && !selected && "opacity-50")}
                  onClick={() => toggleReassignRoom(r.id)}
                >
                  <BedDouble className="h-3 w-3 mr-1" />
                  {r.room_number}
                  {!isReady && <Badge variant="outline" className="ml-1 text-[10px]">{r.status}</Badge>}
                </Button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium">Rate Override (ZAR)</label>
          <input
            type="number"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm mt-1"
            value={reassignPrice}
            onChange={e => setReassignPrice(e.target.value)}
            placeholder="Leave as-is or override"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Original: R{booking.total_price.toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleReassignCheckIn} disabled={reassignRoomIds.length === 0 || !!actionLoading}>
            <LogIn className="h-3 w-3 mr-1" />{actionLoading === "check_in" ? "..." : "Check In with New Room"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowRoomReassign(false)}>Cancel</Button>
        </div>
      </div>
    );
  };

  const sourceChannel = resolveRuSourceChannel(b.modification_notes, b.booking_channel, b.integration_type);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <User className="h-4 w-4" />{b.guest_name}
          {sourceChannel.isRuSourced && (
            <div className="flex items-center gap-1.5 ml-2">
              {sourceChannel.hasSpecificSource && (
                <>
                  <ChannelLogo channelName={sourceChannel.channelLogoKey} size="sm" />
                  <span className="text-sm font-normal text-muted-foreground">{sourceChannel.label}</span>
                </>
              )}
              <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-1.5 py-0 font-bold">{CHANNEL_SOURCE_BADGE}</Badge>
            </div>
          )}
        </SheetTitle>
        <SheetDescription className="flex items-center justify-between">
          <span>Booking {displayBookingReference(b)}</span>
          <Badge variant={STATUS_BADGE_VARIANT[b.status] || "secondary"} className="capitalize">{b.status.replace("_", " ")}</Badge>
        </SheetDescription>
      </SheetHeader>

      {/* Lifecycle Actions */}
      {renderLifecycleActions()}
      {renderRoomReassignDialog()}

      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as BookingDetailTab)} className="mt-4">
        <TabsList className="grid w-full grid-cols-4 h-8">
          <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
          <TabsTrigger value="folio" className="text-xs"><Receipt className="h-3 w-3 mr-1" />Folio</TabsTrigger>
          <TabsTrigger value="invoice" className="text-xs"><FileText className="h-3 w-3 mr-1" />Invoice</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs"><MessageSquareText className="h-3 w-3 mr-1" />Notes</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-4 mt-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
              <Pencil className="h-3 w-3 mr-1" />{isEditing ? "Cancel Edit" : "Edit"}
            </Button>
          </div>

          {isEditing ? (
            <BookingDetailsGrid
              booking={{ ...(b as unknown as BookingDetailsGridBooking), property_id: propertyId }}
              rooms={rooms}
              onSaved={() => { setIsEditing(false); onSaved(); }}
              onOpenFolio={() => onTabChange("folio")}
              onOpenInvoice={() => onTabChange("invoice")}
            />
          ) : (

            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stay</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground text-xs">Check-in</span><p className="font-medium">{format(parseISO(b.check_in_date), "d MMM yyyy")}</p></div>
                  <div><span className="text-muted-foreground text-xs">Check-out</span><p className="font-medium">{format(parseISO(b.check_out_date), "d MMM yyyy")}</p></div>
                </div>
                <p className="text-xs text-muted-foreground">{nights} night{nights !== 1 ? "s" : ""}</p>
              </div>
              <Separator />
              <div className="space-y-1.5 text-sm">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guest</h4>
                <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{b.guest_email}</div>
                {b.guest_phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{b.guest_phone}</div>}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <Badge variant="outline" className="text-xs gap-1"><User className="h-3 w-3" />{b.adults}A</Badge>
                  {(b.children ?? 0) > 0 && <Badge variant="outline" className="text-xs">{b.children}C</Badge>}
                  {(b.teens ?? 0) > 0 && <Badge variant="outline" className="text-xs">{b.teens}T</Badge>}
                  {(b.infants ?? 0) > 0 && <Badge variant="outline" className="text-xs"><Baby className="h-3 w-3" />{b.infants}</Badge>}
                  {(b.pets ?? 0) > 0 && <Badge variant="outline" className="text-xs"><PawPrint className="h-3 w-3" />{b.pets}</Badge>}
                </div>
              </div>
              {assignedRooms.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    {assignedRooms.map(r => <Badge key={r.id} variant="secondary"><BedDouble className="h-3 w-3 mr-1" />{r.room_number}</Badge>)}
                  </div>
                </>
              )}
              <Separator />
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment</h4>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total</span><span className="font-semibold text-lg">R{b.total_price.toLocaleString()}</span></div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CreditCard className="h-3.5 w-3.5" /><span className="capitalize">{b.payment_status || "unknown"}</span>{b.payment_method && <span>· {b.payment_method}</span>}</div>
              </div>
              {b.booking_channel && (
                <>
                  <Separator />
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="capitalize">{channelSourceLabel(b.booking_channel)}</span>
                    {sourceChannel.isRuSourced && sourceChannel.hasSpecificSource && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <ChannelLogo channelName={sourceChannel.channelLogoKey} size="sm" />
                        <span>{sourceChannel.label}</span>
                      </>
                    )}
                    {b.booking_channel === 'rentals_united' && (
                      <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-1.5 py-0 font-bold">{CHANNEL_SOURCE_BADGE}</Badge>
                    )}
                  </div>
                </>
              )}
              {b.special_requests && (
                <>
                  <Separator />
                  <div><h4 className="text-xs font-semibold uppercase tracking-wider text-warning flex items-center gap-1 mb-1"><MessageSquare className="h-3 w-3" />Special Requests</h4>
                  <p className="text-sm bg-amber-500/10 p-2 rounded-md border border-amber-500/20 whitespace-pre-wrap">{b.special_requests}</p></div>
                </>
              )}
            </div>
          )}
        </TabsContent>

        {/* Folio Tab */}
        <TabsContent value="folio" className="mt-3">
          <BookingFolioTab bookingId={b.id} propertyId={b.property_id ?? propertyId} />
        </TabsContent>

        {/* Invoice Tab */}
        <TabsContent value="invoice" className="mt-3 space-y-4">
          <AccountSummaryPanel
            bookingId={b.id}
            propertyId={propertyId}
            guestName={b.guest_name}
            guestEmail={b.guest_email}
            checkOut={b.check_out_date}
            totalPrice={b.total_price}
            bookingStatus={b.status}
            paymentStatus={b.payment_status}
          />
          <BookingInvoice
            bookingId={b.id}
            guestName={b.guest_name}
            guestEmail={b.guest_email}
            checkIn={b.check_in_date}
            checkOut={b.check_out_date}
            adults={b.adults}
            totalPrice={b.total_price}
            propertyId={propertyId}
            paymentStatus={b.payment_status}

          />
        </TabsContent>

        {/* Notes & Complaints Tab */}
        <TabsContent value="notes" className="mt-3">
          <BookingNotesTab
            bookingId={b.id}
            guestId={guestId}
            specialRequests={b.special_requests}
            modificationNotes={b.modification_notes}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
function hasSpecialIndicator(b: BookingRow): boolean {
  return !!(b.requires_intervention || b.special_requests || (b.special_requests_parsed && typeof b.special_requests_parsed === "object" && Object.keys(b.special_requests_parsed).length > 0));
}
