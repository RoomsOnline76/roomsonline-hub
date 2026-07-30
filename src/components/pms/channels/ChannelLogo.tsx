import { cn } from "@/lib/utils";
import bookingAsset from "@/assets/channels/booking.png.asset.json";
import airbnbAsset from "@/assets/channels/airbnb.png.asset.json";
import vrboAsset from "@/assets/channels/vrbo.png.asset.json";
import expediaAsset from "@/assets/channels/expedia.jpeg.asset.json";
import lekkeslaapAsset from "@/assets/channels/lekkeslaap.jpeg.asset.json";
import googleTravelAsset from "@/assets/channels/google-travel.png.asset.json";

const CHANNEL_CONFIG: Record<
  string,
  { label: string; color: string; initials: string; parked?: boolean; financialOnly?: boolean; logoUrl?: string }
> = {
  booking_com: { label: "Booking.com", color: "bg-blue-600", initials: "B", logoUrl: bookingAsset.url },
  airbnb: { label: "Airbnb", color: "bg-rose-500", initials: "A", logoUrl: airbnbAsset.url },
  vrbo: { label: "Vrbo", color: "bg-sky-700", initials: "V", logoUrl: vrboAsset.url },
  expedia: { label: "Expedia", color: "bg-yellow-500", initials: "E", logoUrl: expediaAsset.url },
  agoda: { label: "Agoda", color: "bg-red-600", initials: "Ag" },
  google_hotels: { label: "Google Travel", color: "bg-emerald-500", initials: "G", logoUrl: googleTravelAsset.url },
  lekkeslaap: { label: "Lekkeslaap", color: "bg-orange-500", initials: "Lk", logoUrl: lekkeslaapAsset.url },
  nightsbridge: { label: "NightsBridge", color: "bg-teal-600", initials: "NB" },
  rentalsunited: { label: "Rentals United", color: "bg-indigo-600", initials: "RU", parked: true },
  profitroom: { label: "Profitroom", color: "bg-violet-600", initials: "PR" },
  hyperguest: { label: "HyperGuest", color: "bg-cyan-600", initials: "HG" },
  hotelbeds: { label: "HotelBeds", color: "bg-amber-600", initials: "HB" },
  wetu: { label: "WETU", color: "bg-lime-600", initials: "W" },
  tourplan: { label: "TourPlan", color: "bg-sky-600", initials: "TP" },
  beds24: { label: "Beds24", color: "bg-fuchsia-600", initials: "B24" },
  // PriceLabs is a revenue/financial service, not a bookable channel — label kept
  // for legacy records but excluded from channel pickers via `financialOnly`.
  pricelabs: { label: "PriceLabs", color: "bg-purple-600", initials: "PL", financialOnly: true },
  easyota: { label: "EasyOTA", color: "bg-emerald-600", initials: "EO" },
  ebeds: { label: "eBeds", color: "bg-amber-600", initials: "eB" },
  manual: { label: "Manual", color: "bg-muted-foreground", initials: "M" },
};

export const PARKED_CHANNELS = new Set(
  Object.entries(CHANNEL_CONFIG).filter(([, c]) => c.parked).map(([k]) => k)
);

export function getChannelLabel(channelName: string): string {
  return CHANNEL_CONFIG[channelName]?.label ?? channelName;
}

export function ChannelLogo({
  channelName,
  size = "md",
}: {
  channelName: string;
  size?: "sm" | "md" | "lg";
}) {
  const config = CHANNEL_CONFIG[channelName] ?? { label: channelName, color: "bg-muted", initials: "?" };
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-lg",
  };

  if (config.logoUrl) {
    return (
      <div
        className={cn(
          "rounded-lg overflow-hidden bg-white border border-border flex items-center justify-center shrink-0",
          sizeClasses[size]
        )}
        title={config.label}
      >
        <img
          src={config.logoUrl}
          alt={`${config.label} logo`}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg flex items-center justify-center font-bold text-white shrink-0",
        config.color,
        sizeClasses[size]
      )}
      title={config.label}
    >
      {config.initials}
    </div>
  );
}

export const ALL_CHANNELS = Object.entries(CHANNEL_CONFIG)
  .filter(([k, c]) => k !== "manual" && !c.parked && !c.financialOnly)
  .map(([k]) => k);
