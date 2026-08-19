import { useState, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { AppLayout } from "@/components/layout/AppLayout";
import { applyAdminScope } from "@/lib/adminScope";
import {
  channelQueueProgress,
  ruMandatoryCheckSummary,
  websiteQueueProgress,
  type ChannelQueueStage,
} from "@/lib/onboardingQueueProgress";
import { scoreWebsiteListing } from "@/lib/websiteWizardScore";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchChannelManagerEntitlements } from "@/hooks/useChannelManagerEntitlement";
import {
  fetchChannelLedgerBatch,
  isChannelStepLedgerEnabled,
  seedChannelLedger,
  type PropertyLedgerVerdict,
} from "@/lib/channelStepLedger";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays, isBefore } from "date-fns";
import {
  Search,
  Plus,
  MoreHorizontal,
  Send,
  Copy,
  Clock,
  Check,
  AlertCircle,
  ExternalLink,
  Building2,
  RefreshCw,
  XCircle,
  CalendarPlus,
  Circle,
  Globe,
  Zap,
  Sparkles,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Types
type OnboardingStatus = 
  | "not_started"
  | "in_progress"
  | "token_expired"
  | "completed"
  | "live";

interface TokenData {
  id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  owner_email: string;
  property_id: string;
}

interface PropertyData {
  id: string;
  name: string;
  owner_email: string | null;
  listing_status: string | null;
  show_on_website: boolean;
  is_active: boolean;
  external_system: string | null;
  rentalsunited_property_id: string | null;
  ru_push_enabled: boolean | null;
  amenities: Record<string, unknown> | null;
  description: string | null;
  short_description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  price_per_night: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  images: unknown;
  hero_video_url: string | null;
  property_type?: string | null;
  property_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  owner_name?: string | null;
  ru_location_id?: number | null;
  listing_intent?: string | null;
  // ROL Spec fields
  why_we_chose_this_place: string | null;
  who_this_suits: string | null;
  what_its_really_like: string | null;
  why_this_place_matters: string | null;
  who_its_not_for: string | null;
  navigation_tags: string[] | null;
}

interface PropertyOnboardingRow {
  id: string;
  name: string;
  owner_email: string | null;
  listing_status: string | null;
  show_on_website: boolean;
  external_system: string | null;
  isNightsBridge: boolean;
  isRolos: boolean;
  onboarding_score: number;
  fieldCompletionScore: number;
  rolSpecScore: number;
  websitePercent: number;
  websiteLabel: string;
  websiteHint: string;
  websiteMeetsMinimum: boolean;
  token: TokenData | null;
  contractStatus: string | null;
  channelStage: ChannelQueueStage;
  channelPercent: number;
  channelLabel: string;
  channelHint: string;
  channelsConnected: number;
  channelManagerEnabled: boolean;
}

// Calculate ROL Spec completion (applies to ALL properties)
const calculateROLSpecCompletion = (prop: PropertyData): number => {
  const amenities = prop.amenities || {};
  
  const rolSpecFields = [
    { filled: !!prop.why_we_chose_this_place, weight: 2 },
    { filled: !!prop.who_this_suits, weight: 2 },
    { filled: !!prop.what_its_really_like, weight: 2 },
    { filled: !!prop.why_this_place_matters, weight: 1 },
    { filled: !!prop.who_its_not_for, weight: 1 },
    { filled: Array.isArray(prop.navigation_tags) && prop.navigation_tags.length > 0, weight: 2 },
    // Extras from amenities
    { filled: !!(amenities as Record<string, unknown>).local_experiences, weight: 1 },
    { filled: !!(amenities as Record<string, unknown>).unique_selling_points, weight: 1 },
  ];

  const totalWeight = rolSpecFields.reduce((sum, f) => sum + f.weight, 0);
  const filledWeight = rolSpecFields.reduce((sum, f) => sum + (f.filled ? f.weight : 0), 0);
  
  return Math.round((filledWeight / totalWeight) * 100);
};

// Calculate field completion percentage based on key property fields
const calculateFieldCompletion = (prop: PropertyData): number => {
  const amenities = prop.amenities || {};
  
  const fields = [
    { filled: !!prop.name, weight: 1 },
    { filled: !!prop.description, weight: 2 },
    { filled: !!prop.short_description, weight: 1 },
    { filled: !!prop.owner_email, weight: 1 },
    { filled: !!prop.address, weight: 1 },
    { filled: !!prop.city, weight: 1 },
    { filled: !!prop.country, weight: 1 },
    { filled: prop.price_per_night !== null && prop.price_per_night > 0, weight: 2 },
    { filled: prop.bedrooms !== null && prop.bedrooms > 0, weight: 1 },
    { filled: prop.bathrooms !== null && prop.bathrooms > 0, weight: 1 },
    { filled: Array.isArray(prop.images) && prop.images.length > 0, weight: 2 },
    { filled: !!prop.hero_video_url || !!(amenities as Record<string, unknown>).hero_image_url, weight: 2 },
    { filled: !!(amenities as Record<string, unknown>).check_in_time, weight: 1 },
    { filled: !!(amenities as Record<string, unknown>).check_out_time, weight: 1 },
    { filled: !!(amenities as Record<string, unknown>).cancellation_policy, weight: 1 },
    { filled: !!(amenities as Record<string, unknown>).telephone || !!((amenities as Record<string, unknown>).contact as Record<string, unknown>)?.telephone, weight: 1 },
  ];

  const totalWeight = fields.reduce((sum, f) => sum + f.weight, 0);
  const filledWeight = fields.reduce((sum, f) => sum + (f.filled ? f.weight : 0), 0);
  
  return Math.round((filledWeight / totalWeight) * 100);
};

type QueueFilter =
  | "all"
  | OnboardingStatus
  | "website_live"
  | "channels_live"
  | "channels_awaiting"
  | "channel_manager_off";

/** Filters that include properties the queue hides until "show finished" is on. */
const FINISHED_INCLUSIVE_FILTERS: QueueFilter[] = [
  "live",
  "completed",
  "website_live",
  "channels_live",
];

// Helper function to derive onboarding status
const getOnboardingStatus = (row: PropertyOnboardingRow): OnboardingStatus => {
  if (row.show_on_website) return "live";
  
  // NightsBridge properties: only "completed" if the listing wizard meets the 70% floor
  if (row.isNightsBridge && !row.token) {
    return row.websiteMeetsMinimum ? "completed" : "in_progress";
  }
  
  if (!row.token) return "not_started";
  if (row.token.used_at) return "completed";
  if (isBefore(new Date(row.token.expires_at), new Date())) return "token_expired";
  return "in_progress";
};

/**
 * Header counter that doubles as the queue filter. The number and the rows
 * below always describe the same set, so the card is the filter control.
 */
const CounterCard = ({
  label,
  caption,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  caption: string;
  value: number;
  tone?: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      "rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/40",
      active ? "border-primary ring-2 ring-primary" : "border-border",
    )}
  >
    <p className="text-sm font-medium text-muted-foreground">{label}</p>
    <p className={cn("mt-1 text-2xl font-bold", tone)}>{value}</p>
    <p className="mt-1 text-xs leading-snug text-muted-foreground">{caption}</p>
  </button>
);

// Status Badge Component
const StatusBadge = ({ status, isNightsBridge }: { status: OnboardingStatus; isNightsBridge?: boolean }) => {
  const badge = (() => {
    switch (status) {
      case "not_started":
        return (
          <Badge variant="outline" className="gap-1">
            <Circle className="h-3 w-3" />
            Not Started
          </Badge>
        );
      case "in_progress":
        return (
          <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
            <Clock className="h-3 w-3" />
            In Progress
          </Badge>
        );
      case "token_expired":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Expired
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="default" className="gap-1">
            <Check className="h-3 w-3" />
            Completed
          </Badge>
        );
      case "live":
        return (
          <Badge className="gap-1 bg-emerald-500 text-white border-emerald-500">
            <Globe className="h-3 w-3" />
            Live
          </Badge>
        );
    }
  })();

  if (isNightsBridge) {
    return (
      <div className="flex items-center gap-1.5">
        {badge}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Zap className="h-3.5 w-3.5 text-amber-500" />
            </TooltipTrigger>
            <TooltipContent>
              <p>NightsBridge property - data synced from PMS</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return badge;
};

export default function AdminOnboarding() {
  const navigate = useNavigate();
  const { scopedPropertyIds, scopeResolved, user, profile } = useAuth();
  const actorEmail = user?.email ?? profile?.email ?? null;
  const [propertyRows, setPropertyRows] = useState<PropertyOnboardingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<QueueFilter>("all");
  const queueRef = useRef<HTMLDivElement | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // Send modal state
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [sendEmail, setSendEmail] = useState("");
  const [sending, setSending] = useState(false);

  // Extend modal state
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendRow, setExtendRow] = useState<PropertyOnboardingRow | null>(null);
  const [extendDays, setExtendDays] = useState("30");
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    if (!scopeResolved) return;
    // Email is what pins ru-admin to Seesig + Tidal. Do not fetch the full
    // onboarding queue until we know who is signed in.
    if (user && !actorEmail) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeResolved, scopedPropertyIds.join(","), actorEmail, user?.id]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Scope comes from `scoped_admin_properties` only — no hardcoded pins.
      const pinIds = scopedPropertyIds;

      // Load only ACTIVE properties (non-deleted, is_active = true)
      const propQuery = supabase
        .from("properties")
        .select(`
          id, name, owner_email, owner_name, listing_status, show_on_website, is_active,
          external_system, rentalsunited_property_id, ru_push_enabled, ru_location_id,
          amenities, description, short_description, listing_intent,
          is_sandbox, is_test_property,
          property_type, property_url, latitude, longitude,
          address, city, country, price_per_night, bedrooms, bathrooms, 
          images, hero_video_url,
          why_we_chose_this_place, who_this_suits, what_its_really_like,
          why_this_place_matters, who_its_not_for, navigation_tags
        `)
        .is("permanently_deleted_at", null)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      const { data: propData, error: propError } = await applyAdminScope(
        propQuery,
        "id",
        pinIds,
      );

      if (propError) throw propError;

      // Load all tokens (to map to properties)
      const { data: tokenData, error: tokenError } = await supabase
        .from("property_onboarding_tokens")
        .select("*")
        .order("created_at", { ascending: false });

      if (tokenError) throw tokenError;

      const ids = (propData || []).map((p) => p.id);
      const emails = [...new Set((propData || []).map((p) => p.owner_email).filter(Boolean))] as string[];

      const [{ data: connectionData }, billingByProperty, { data: contractData }, { data: unitData }, { data: ratePlanData }, contactResult] =
        await Promise.all([
        ids.length
          ? supabase.from("rolos_channel_connections").select("property_id, status").in("property_id", ids)
          : Promise.resolve({ data: [] as { property_id: string; status: string }[] }),
        // Portfolio-first: a member property is billed from its portfolio config,
        // so the per-property row alone would under-report the entitlement.
        fetchChannelManagerEntitlements(ids),
        emails.length
          ? supabase
              .from("owner_contracts")
              .select("owner_email, status")
              .in("owner_email", emails)
              .order("version", { ascending: false })
          : Promise.resolve({ data: [] as { owner_email: string; status: string }[] }),
        ids.length
          ? supabase
              .from("hostfully_room_types")
              .select("id, property_id, name, is_active, rentalsunited_property_id, max_guests, daily_rate, total_units, description")
              .in("property_id", ids)
          : Promise.resolve({
              data: [] as {
                id: string;
                property_id: string;
                name: string | null;
                is_active: boolean | null;
                rentalsunited_property_id: string | null;
                max_guests: number | null;
                daily_rate: number | null;
                total_units: number | null;
                description: string | null;
              }[],
            }),
        ids.length
          ? supabase
              .from("rolos_rate_plans")
              .select("property_id, base_rate, is_primary_sell, is_active")
              .in("property_id", ids)
          : Promise.resolve({
              data: [] as {
                property_id: string;
                base_rate: number | null;
                is_primary_sell: boolean | null;
                is_active: boolean | null;
              }[],
            }),
        ids.length
          ? supabase
              .from("property_contact_details")
              .select("property_id, role, phone, name, email")
              .in("property_id", ids)
              .then(
                (r) => r,
                () => ({
                  data: [] as {
                    property_id: string;
                    role: string | null;
                    phone: string | null;
                    name: string | null;
                    email: string | null;
                  }[],
                }),
              )
          : Promise.resolve({
              data: [] as {
                property_id: string;
                role: string | null;
                phone: string | null;
                name: string | null;
                email: string | null;
              }[],
            }),
      ]);
      const contactData = contactResult?.data ?? [];

      const connectedByProperty = new Map<string, number>();
      (connectionData ?? []).forEach((c) => {
        if (["connected", "active", "live"].includes(String(c.status ?? "").toLowerCase())) {
          connectedByProperty.set(c.property_id, (connectedByProperty.get(c.property_id) ?? 0) + 1);
        }
      });
      const unitsByProperty = new Map<string, { active: number; published: number }>();
      const roomsByProperty = new Map<string, NonNullable<typeof unitData>>();
      (unitData ?? []).forEach((u) => {
        const rooms = roomsByProperty.get(u.property_id) ?? [];
        rooms.push(u);
        roomsByProperty.set(u.property_id, rooms);
        if (u.is_active === false) return;
        const cur = unitsByProperty.get(u.property_id) ?? { active: 0, published: 0 };
        cur.active += 1;
        if (String(u.rentalsunited_property_id ?? "").trim()) cur.published += 1;
        unitsByProperty.set(u.property_id, cur);
      });
      const ratePlansByProperty = new Map<string, NonNullable<typeof ratePlanData>>();
      (ratePlanData ?? []).forEach((p) => {
        const list = ratePlansByProperty.get(p.property_id) ?? [];
        list.push(p);
        ratePlansByProperty.set(p.property_id, list);
      });
      const contactsByProperty = new Map<string, typeof contactData>();
      contactData.forEach((c) => {
        const list = contactsByProperty.get(c.property_id) ?? [];
        list.push(c);
        contactsByProperty.set(c.property_id, list);
      });
      const contractByEmail = new Map<string, string>();
      (contractData ?? []).forEach((c) => {
        const key = String(c.owner_email ?? "").toLowerCase();
        if (key && !contractByEmail.has(key)) contractByEmail.set(key, c.status);
      });

      // Build property-centric view - use most recent token per property
      const tokensByProperty = new Map<string, TokenData>();
      tokenData?.forEach((t) => {
        // Only set if not already set (first one is most recent due to order)
        if (!tokensByProperty.has(t.property_id)) {
          tokensByProperty.set(t.property_id, t);
        }
      });

      // Only a genuine sandbox environment is excluded. Names are never inspected
      // and the Test flag is a marker only, so "RU Test Clone A" behaves normally.
      const realProperties = (propData || []).filter(
        (prop) => (prop as { is_sandbox?: boolean | null }).is_sandbox !== true,
      );


      const rolosSystems = new Set(["roomsonline", "rolos", "rol_os", "rolos_pms"]);

      const rolosIds = realProperties
        .filter(
          (prop) =>
            rolosSystems.has(String(prop.external_system ?? "").toLowerCase()) &&
            // No entitlement, no wizard — and no reason to spend a channel probe.
            billingByProperty.get(prop.id) === true,
        )
        .map((prop) => prop.id);
      // Live channel probes never block the first paint: the queue renders from
      // local state, then each probe refines its own row as it lands.
      const ruByProperty = new Map<string, ReturnType<typeof ruMandatoryCheckSummary>>();
      const channelInputsById = new Map<string, Parameters<typeof channelQueueProgress>[0]>();




      const enrichedProperties: PropertyOnboardingRow[] = realProperties.map((prop) => {
        const amenities = prop.amenities as Record<string, unknown> | null;
        const isNightsBridge = prop.external_system === "nightsbridge";
        const isRolos = rolosSystems.has(String(prop.external_system ?? "").toLowerCase());
        const channelsConnected = connectedByProperty.get(prop.id) ?? 0;
        const channelManagerEnabled = billingByProperty.get(prop.id) === true;
        const units = unitsByProperty.get(prop.id) ?? { active: 0, published: 0 };
        const ruChecks = ruByProperty.get(prop.id);
        const channelInputs = {
          isRolos,
          channelsConnected,
          propertyListingId: prop.rentalsunited_property_id ?? null,
          activeUnits: units.active,
          publishedUnits: units.published,
          hasDistributionIdentity: channelManagerEnabled || !!prop.ru_push_enabled,
          ruMandatoryPass: ruChecks?.known ? ruChecks.pass : null,
          ruMandatoryPercent: ruChecks?.known ? ruChecks.percent : null,
        };
        channelInputsById.set(prop.id, channelInputs);
        const channel = channelQueueProgress(channelInputs);
        
        const propertyData: PropertyData = {
          id: prop.id,
          name: prop.name,
          owner_email: prop.owner_email,
          listing_status: prop.listing_status,
          show_on_website: prop.show_on_website || false,
          is_active: prop.is_active || true,
          external_system: prop.external_system,
          rentalsunited_property_id: prop.rentalsunited_property_id ?? null,
          ru_push_enabled: prop.ru_push_enabled ?? null,
          amenities,
          description: prop.description,
          short_description: prop.short_description,
          address: prop.address,
          city: prop.city,
          country: prop.country,
          price_per_night: prop.price_per_night,
          bedrooms: prop.bedrooms,
          bathrooms: prop.bathrooms,
          images: prop.images,
          hero_video_url: prop.hero_video_url,
          property_type: prop.property_type,
          property_url: prop.property_url,
          latitude: prop.latitude,
          longitude: prop.longitude,
          owner_name: prop.owner_name,
          ru_location_id: prop.ru_location_id,
          listing_intent: prop.listing_intent,
          why_we_chose_this_place: prop.why_we_chose_this_place,
          who_this_suits: prop.who_this_suits,
          what_its_really_like: prop.what_its_really_like,
          why_this_place_matters: prop.why_this_place_matters,
          who_its_not_for: prop.who_its_not_for,
          navigation_tags: prop.navigation_tags,
        };

        const liveWebsiteScore = scoreWebsiteListing({
          property: {
            name: prop.name,
            property_type: prop.property_type,
            property_url: prop.property_url,
            address: prop.address,
            city: prop.city,
            country: prop.country,
            latitude: prop.latitude,
            longitude: prop.longitude,
            description: prop.description,
            short_description: prop.short_description,
            images: prop.images,
            amenities,
            listing_intent: prop.listing_intent,
            owner_name: prop.owner_name,
            owner_email: prop.owner_email,
            ru_location_id: prop.ru_location_id,
            price_per_night: prop.price_per_night,
          },
          rooms: roomsByProperty.get(prop.id) ?? [],
          ratePlans: ratePlansByProperty.get(prop.id) ?? [],
          contacts: contactsByProperty.get(prop.id) ?? [],
        });
        
        // Calculate scores
        const fieldCompletionScore = calculateFieldCompletion(propertyData);
        const rolSpecScore = calculateROLSpecCompletion(propertyData);
        const website = websiteQueueProgress(
          liveWebsiteScore,
          liveWebsiteScore,
          prop.show_on_website || false,
        );
        
        return {
          id: prop.id,
          name: prop.name,
          owner_email: prop.owner_email,
          listing_status: prop.listing_status,
          show_on_website: prop.show_on_website || false,
          external_system: prop.external_system,
          isNightsBridge,
          isRolos,
          onboarding_score: liveWebsiteScore,
          fieldCompletionScore,
          rolSpecScore,
          websitePercent: website.percent,
          websiteLabel: website.label,
          websiteHint: website.hint,
          websiteMeetsMinimum: website.meetsMinimum,
          token: tokensByProperty.get(prop.id) || null,
          contractStatus: prop.owner_email
            ? contractByEmail.get(String(prop.owner_email).toLowerCase()) ?? null
            : null,
          channelStage: channel.stage,
          channelPercent: channel.percent,
          channelLabel: channel.label,
          channelHint: channel.hint,
          channelsConnected,
          channelManagerEnabled,
        };
      });

      setPropertyRows(enrichedProperties);
      setLoading(false);

      // Background refinement: probe live channel readiness per ROL'OS property and
      // patch just that row. Small concurrency keeps the channel rate limiter happy.
      const probeQueue = [...rolosIds];
      const runProbe = async (propertyId: string) => {
        try {
          const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
            body: { action: "phase_status", property_id: propertyId, probe_ari: true },
          });
          if (error || data?.success !== true) return;
          const listed = !!data?.readiness?.ru_property_id;
          const summary = ruMandatoryCheckSummary(data.readiness ?? null, {
            // Listing exists but the scorer fell back to the local calendar:
            // the live availability verdict is unavailable, not failing.
            liveProbeDegraded: listed && data?.availability_source !== "channel",
          });
          const inputs = channelInputsById.get(propertyId);
          if (!inputs) return;
          const channel = channelQueueProgress({
            ...inputs,
            ruMandatoryPass: summary.known ? summary.pass : null,
            ruMandatoryPercent: summary.known ? summary.percent : null,
          });
          setPropertyRows((prev) =>
            prev.map((row) =>
              row.id === propertyId
                ? {
                    ...row,
                    channelStage: channel.stage,
                    channelPercent: channel.percent,
                    channelLabel: channel.label,
                    channelHint: channel.hint,
                  }
                : row,
            ),
          );
        } catch {
          // Leave unknown — the local verdict stands.
        }
      };
      void Promise.all(
        Array.from({ length: Math.min(3, probeQueue.length) }, async () => {
          for (let id = probeQueue.shift(); id; id = probeQueue.shift()) await runProbe(id);
        }),
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
      setLoading(false);
    }
  };

  // Filtered properties based on search, status filter, and show completed toggle
  const filteredProperties = useMemo(() => {
    let result = propertyRows;
    if (scopedPropertyIds.length) {
      result = result.filter((r) => scopedPropertyIds.includes(r.id));
    }

    // Parties that still have a job: website onboarding started, or any ROL'OS
    // property that can be taken live on channels.
    const activeStatuses = ["onboarding_active", "review_pending", "activation_ready", "live"];
    result = result.filter((r) => {
      if (r.isRolos) return true;
      if (r.show_on_website) return true;
      if (r.token) return true;
      if (r.onboarding_score > 0) return true;
      if (r.listing_status && activeStatuses.includes(r.listing_status)) return true;
      return false;
    });

    // Hide only when BOTH outcomes are done (website live, and channels live or not applicable).
    if (!showCompleted) {
      result = result.filter((r) => {
        const websiteDone = r.show_on_website;
        const channelsDone = r.channelStage === "live" || r.channelStage === "na";
        return !(websiteDone && channelsDone);
      });
    }

    // Status filter
    if (statusFilter === "website_live") {
      result = result.filter((r) => r.show_on_website);
    } else if (statusFilter === "channels_live") {
      result = result.filter((r) => r.channelStage === "live");
    } else if (statusFilter === "channels_awaiting") {
      result = result.filter((r) => r.channelStage === "connect");
    } else if (statusFilter === "channel_manager_off") {
      result = result.filter((r) => r.isRolos && !r.channelManagerEnabled);
    } else if (statusFilter !== "all") {
      result = result.filter((r) => getOnboardingStatus(r) === statusFilter);
    }

    // Search filter (cross-column)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((r) => {
        const status = getOnboardingStatus(r);
        const tokenSentDate = r.token 
          ? format(new Date(r.token.created_at), "MMM d, yyyy").toLowerCase() 
          : "";
        const progressStr = String(r.websitePercent || 0);

        return (
          r.name.toLowerCase().includes(query) ||
          r.owner_email?.toLowerCase().includes(query) ||
          status.replace("_", " ").includes(query) ||
          tokenSentDate.includes(query) ||
          progressStr.includes(query) ||
          (r.isNightsBridge && "nightsbridge".includes(query))
        );
      });
    }

    // ROL'OS properties lead the queue — they are the ones we can take live.
    return [...result].sort((a, b) => {
      if (a.isRolos !== b.isRolos) return a.isRolos ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [actorEmail, propertyRows, scopedPropertyIds, showCompleted, statusFilter, searchQuery]);

  // Stats calculated from properties with actual onboarding activity
  const onboardingActiveRows = useMemo(() => {
    const activeStatuses = ["onboarding_active", "review_pending", "activation_ready", "live"];
    const source = scopedPropertyIds.length
      ? propertyRows.filter((r) => scopedPropertyIds.includes(r.id))
      : propertyRows;
    return source.filter((r) => {
      if (r.isRolos) return true;
      if (r.show_on_website) return true;
      if (r.token) return true;
      if (r.onboarding_score > 0) return true;
      if (r.listing_status && activeStatuses.includes(r.listing_status)) return true;
      return false;
    });
  }, [actorEmail, propertyRows]);

  const stats = useMemo(() => ({
    total: onboardingActiveRows.length,
    notStarted: onboardingActiveRows.filter((r) => getOnboardingStatus(r) === "not_started").length,
    inProgress: onboardingActiveRows.filter((r) => getOnboardingStatus(r) === "in_progress").length,
    expired: onboardingActiveRows.filter((r) => getOnboardingStatus(r) === "token_expired").length,
    completed: onboardingActiveRows.filter((r) => getOnboardingStatus(r) === "completed").length,
    live: onboardingActiveRows.filter((r) => getOnboardingStatus(r) === "live").length,
    nightsBridge: onboardingActiveRows.filter((r) => r.isNightsBridge).length,
    websiteLive: onboardingActiveRows.filter((r) => r.show_on_website).length,
    channelsLive: onboardingActiveRows.filter((r) => r.channelStage === "live").length,
    channelsAwaiting: onboardingActiveRows.filter((r) => r.channelStage === "connect").length,
    channelManagerOff: onboardingActiveRows.filter((r) => r.isRolos && !r.channelManagerEnabled).length,
  }), [onboardingActiveRows]);

  // Cards are the filter: clicking one narrows the queue, clicking it again clears.
  const applyFilter = (key: QueueFilter) => {
    const next = statusFilter === key ? "all" : key;
    setStatusFilter(next);
    if (next !== "all" && FINISHED_INCLUSIVE_FILTERS.includes(next)) setShowCompleted(true);
    queueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSendOnboarding = async () => {
    if (!selectedPropertyId || !sendEmail) {
      toast.error("Property and email are required");
      return;
    }

    try {
      setSending(true);
      const { error } = await supabase.functions.invoke("send-onboarding-email", {
        body: { property_id: selectedPropertyId, owner_email: sendEmail },
      });

      if (error) throw error;

      toast.success("Onboarding email sent successfully");
      setSendModalOpen(false);
      setSelectedPropertyId("");
      setSendEmail("");
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to send onboarding email");
    } finally {
      setSending(false);
    }
  };

  const handleIssueToken = (row: PropertyOnboardingRow) => {
    setSelectedPropertyId(row.id);
    setSendEmail(row.owner_email || "");
    setSendModalOpen(true);
  };

  const handleResendOnboarding = async (row: PropertyOnboardingRow) => {
    if (!row.owner_email) {
      toast.error("No owner email configured for this property");
      return;
    }

    try {
      const { error } = await supabase.functions.invoke("send-onboarding-email", {
        body: { property_id: row.id, owner_email: row.owner_email },
      });

      if (error) throw error;
      toast.success("Onboarding email sent successfully");
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to send onboarding email");
    }
  };

  const handleCopyLink = (row: PropertyOnboardingRow) => {
    if (!row.token) {
      toast.error("No token exists for this property");
      return;
    }
    const link = `${window.location.origin}/onboarding/${row.token.token}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copied to clipboard");
  };

  const handleInvalidateToken = async (row: PropertyOnboardingRow) => {
    if (!row.token) return;

    try {
      const { error } = await supabase
        .from("property_onboarding_tokens")
        .update({ expires_at: new Date().toISOString() })
        .eq("id", row.token.id);

      if (error) throw error;
      toast.success("Token invalidated");
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to invalidate token");
    }
  };

  const handleExtendToken = async () => {
    if (!extendRow?.token) return;

    try {
      setExtending(true);
      const newExpiry = addDays(new Date(), parseInt(extendDays));

      const { error } = await supabase
        .from("property_onboarding_tokens")
        .update({ expires_at: newExpiry.toISOString() })
        .eq("id", extendRow.token.id);

      if (error) throw error;

      toast.success("Token expiry extended");
      setExtendModalOpen(false);
      setExtendRow(null);
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to extend token");
    } finally {
      setExtending(false);
    }
  };



  return (
    <AppLayout>
      <PageHeader
        title="Onboarding"
        subtitle="Every new property — website listing and channel go-live — starts here"
        actions={
          <Button onClick={() => setSendModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Send website invite
          </Button>
        }
      />

      {/* Counters — clicking one filters the queue below */}
      <div className="space-y-3 mb-6">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Progress</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:gap-6">
            <CounterCard
              label="Active queue"
              caption="Properties with onboarding under way"
              value={stats.total}
              active={statusFilter === "all"}
              onClick={() => applyFilter("all")}
            />
            <CounterCard
              label="Invite not sent"
              caption="No owner invite issued yet"
              value={stats.notStarted}
              tone="text-muted-foreground"
              active={statusFilter === "not_started"}
              onClick={() => applyFilter("not_started")}
            />
            <CounterCard
              label="Owner in progress"
              caption="Invite open, owner still filling in"
              value={stats.inProgress}
              tone="text-amber-600"
              active={statusFilter === "in_progress"}
              onClick={() => applyFilter("in_progress")}
            />
            <CounterCard
              label="Invite expired"
              caption="Link lapsed — extend or resend"
              value={stats.expired}
              tone="text-destructive"
              active={statusFilter === "token_expired"}
              onClick={() => applyFilter("token_expired")}
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Distribution</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:gap-6">
            <CounterCard
              label="Website live"
              caption="Published on the public site"
              value={stats.websiteLive}
              tone="text-emerald-600"
              active={statusFilter === "website_live"}
              onClick={() => applyFilter("website_live")}
            />
            <CounterCard
              label="Channels live"
              caption="Selling through the Channel Manager"
              value={stats.channelsLive}
              tone="text-emerald-600"
              active={statusFilter === "channels_live"}
              onClick={() => applyFilter("channels_live")}
            />
            <CounterCard
              label="Awaiting channel"
              caption="Listed and verified, no channel connected"
              value={stats.channelsAwaiting}
              tone="text-primary"
              active={statusFilter === "channels_awaiting"}
              onClick={() => applyFilter("channels_awaiting")}
            />
            <CounterCard
              label="Channel Manager off"
              caption="Add-on not enabled — no channel wizard"
              value={stats.channelManagerOff}
              tone="text-muted-foreground"
              active={statusFilter === "channel_manager_off"}
              onClick={() => applyFilter("channel_manager_off")}
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search properties, emails, status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {statusFilter !== "all" && (
            <Button variant="outline" size="sm" onClick={() => setStatusFilter("all")}>
              Clear filter
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Switch id="show-completed" checked={showCompleted} onCheckedChange={setShowCompleted} />
            <Label htmlFor="show-completed" className="text-sm text-muted-foreground whitespace-nowrap">
              Show finished properties
            </Label>
          </div>
        </div>
      </div>

      {/* Table */}
      <div ref={queueRef} className="border border-border rounded-lg scroll-mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead>Website listing</TableHead>
              <TableHead>RU channels</TableHead>
              <TableHead>Next</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading properties...
                </TableCell>
              </TableRow>
            ) : filteredProperties.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {propertyRows.length === 0 
                    ? "No active properties found" 
                    : showCompleted 
                      ? "No properties match your filters"
                      : "No properties still in progress. Toggle 'Show finished properties' to see everyone."}
                </TableCell>
              </TableRow>
            ) : (
              filteredProperties.map((row) => {
                const status = getOnboardingStatus(row);
                // The Channels wizard only exists once the Channel Manager is
                // enabled and billed for the property (or its portfolio).
                const channelWizardAvailable = row.isRolos && row.channelManagerEnabled;
                const nextLabel = channelWizardAvailable
                  ? row.channelStage === "live"
                    ? row.show_on_website
                      ? "Finished"
                      : "Activate website"
                    : row.channelStage === "connect"
                      ? "Connect a channel"
                      : "Channel wizard"
                  : status === "live"
                    ? "On website"
                    : "Website profile";
                return (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate(
                        channelWizardAvailable
                          ? `/admin/onboarding/${row.id}`
                          : `/admin/properties/${row.id}?section=onboarding`,
                      )
                    }
                  >
                    <TableCell>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(
                            channelWizardAvailable
                              ? `/admin/onboarding/${row.id}`
                              : `/admin/properties/${row.id}?section=onboarding`,
                          );
                        }}
                        className="font-medium hover:text-primary hover:underline text-left"
                      >
                        {row.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.owner_email || <span className="italic">Not set</span>}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs capitalize text-muted-foreground">
                        {row.contractStatus ? row.contractStatus.replace("_", " ") : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="min-w-36 space-y-1">
                              <div className="flex items-center gap-2">
                                <Progress value={row.websitePercent} className="h-2" />
                                <span className="w-10 shrink-0 text-sm text-muted-foreground">
                                  {row.websitePercent}%
                                </span>
                              </div>
                              <p
                                className={`text-[10px] leading-tight ${
                                  row.show_on_website || row.websiteMeetsMinimum
                                    ? "text-emerald-600"
                                    : "text-amber-600"
                                }`}
                              >
                                {row.websiteLabel}
                              </p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-medium">Website listing wizard</p>
                            <p>{row.websiteHint}</p>
                            <p className="mt-1 text-muted-foreground">
                              Same score as the Website wizard ({row.onboarding_score}%). ROL Spec {row.rolSpecScore}% is editorial and is not in this bar.
                            </p>
                            {row.isNightsBridge && <p className="text-amber-400">NightsBridge synced</p>}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>
                      {row.channelStage === "na" ? (
                        <span className="text-xs text-muted-foreground">Not ROL'OS</span>
                      ) : !row.channelManagerEnabled ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground">Channel Manager not enabled</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-medium">Distribution is a billable add-on</p>
                              <p>
                                Switch the Channel Manager on in this property's Billing Config — the Channels wizard
                                opens after that.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="min-w-36 space-y-1">
                                <div className="flex items-center gap-2">
                                  <Progress
                                    value={row.channelPercent}
                                    className={`h-2 ${
                                      row.channelStage === "live" || row.channelStage === "connect"
                                        ? "[&>div]:bg-emerald-500"
                                        : ""
                                    }`}
                                  />
                                  <span className="w-10 shrink-0 text-sm text-muted-foreground">
                                    {row.channelPercent}%
                                  </span>
                                </div>
                                <p
                                  className={`text-[10px] leading-tight ${
                                    row.channelStage === "live" || row.channelStage === "connect"
                                      ? "text-emerald-600"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {row.channelLabel}
                                </p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-medium">RU channel wizard</p>
                              <p>{row.channelHint}</p>
                              <p className="mt-1 text-muted-foreground">
                                Ready to connect only after live RU onboarding tests pass — listing IDs alone are not enough.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/properties/${row.id}?section=onboarding`);
                          }}
                        >
                          Website wizard
                        </Button>
                        {channelWizardAvailable && (
                          <Button
                            size="sm"
                            variant={row.channelStage !== "live" ? "default" : "outline"}
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/onboarding/${row.id}`);
                            }}
                          >
                            {nextLabel}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover">
                          <DropdownMenuItem onClick={() => navigate(`/admin/properties/${row.id}?section=onboarding`)}>
                            <Building2 className="h-4 w-4 mr-2" />
                            Open website listing wizard
                          </DropdownMenuItem>
                          {channelWizardAvailable && (
                            <DropdownMenuItem onClick={() => navigate(`/admin/onboarding/${row.id}`)}>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Open channel wizard
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {/* Issue/Resend token based on status */}
                          {status === "not_started" && !row.isNightsBridge ? (
                            <DropdownMenuItem onClick={() => handleIssueToken(row)}>
                              <Send className="h-4 w-4 mr-2" />
                              Issue Onboarding Token
                            </DropdownMenuItem>
                          ) : !row.isNightsBridge ? (
                            <DropdownMenuItem onClick={() => handleResendOnboarding(row)}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Re-issue Token
                            </DropdownMenuItem>
                          ) : null}

                          {/* Copy link (only if token exists) */}
                          {row.token && (
                            <DropdownMenuItem onClick={() => handleCopyLink(row)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Link
                            </DropdownMenuItem>
                          )}

                          {/* Extend expiry (only for active/expired tokens) */}
                          {row.token && (status === "in_progress" || status === "token_expired") && (
                            <DropdownMenuItem
                              onClick={() => {
                                setExtendRow(row);
                                setExtendModalOpen(true);
                              }}
                            >
                              <CalendarPlus className="h-4 w-4 mr-2" />
                              Extend Expiry
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem onClick={() => navigate(`/admin/properties/${row.id}`)}>
                            <Building2 className="h-4 w-4 mr-2" />
                            View Property
                          </DropdownMenuItem>

                          {row.token && (
                            <DropdownMenuItem asChild>
                              <a
                                href={`/admin/audit?table_name=property_onboarding_tokens&search_text=${row.owner_email || row.name}`}
                                target="_blank"
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Audit Trail
                              </a>
                            </DropdownMenuItem>
                          )}

                          {/* Invalidate (only for active tokens) */}
                          {status === "in_progress" && row.token && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleInvalidateToken(row)}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Invalidate Token
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Send Onboarding Modal */}
      <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Onboarding Invitation</DialogTitle>
            <DialogDescription>
              Send an onboarding invitation to a property owner. They will receive an email with a link to complete the wizard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="property">Property *</Label>
              <Select
                value={selectedPropertyId}
                onValueChange={(value) => {
                  setSelectedPropertyId(value);
                  const prop = propertyRows.find((p) => p.id === value);
                  if (prop?.owner_email) {
                    setSendEmail(prop.owner_email);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {propertyRows
                    .filter((prop) => !prop.isNightsBridge)
                    .map((prop) => (
                      <SelectItem key={prop.id} value={prop.id}>
                        {prop.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Owner Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="owner@example.com"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendOnboarding} disabled={sending || !selectedPropertyId || !sendEmail}>
              {sending ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend Token Modal */}
      <Dialog open={extendModalOpen} onOpenChange={setExtendModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Token Expiry</DialogTitle>
            <DialogDescription>
              Extend the expiry date for the onboarding token.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Property</Label>
              <p className="text-sm text-muted-foreground">{extendRow?.name}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="days">Extend by</Label>
              <Select value={extendDays} onValueChange={setExtendDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExtendToken} disabled={extending}>
              {extending ? "Extending..." : "Extend Expiry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
