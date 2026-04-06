import { cn } from "@/lib/utils";

const CHANNEL_CONFIG: Record<string, { label: string; color: string; initials: string }> = {
  booking_com: { label: "Booking.com", color: "bg-blue-600", initials: "B" },
  airbnb: { label: "Airbnb", color: "bg-rose-500", initials: "A" },
  expedia: { label: "Expedia", color: "bg-yellow-500", initials: "E" },
  agoda: { label: "Agoda", color: "bg-red-600", initials: "Ag" },
  google_hotels: { label: "Google Hotels", color: "bg-emerald-500", initials: "G" },
  lekkeslaap: { label: "Lekkeslaap", color: "bg-orange-500", initials: "Lk" },
  nightsbridge: { label: "NightsBridge", color: "bg-teal-600", initials: "NB" },
  rentalsunited: { label: "Rentals United", color: "bg-indigo-600", initials: "RU" },
  profitroom: { label: "Profitroom", color: "bg-violet-600", initials: "PR" },
  hyperguest: { label: "HyperGuest", color: "bg-cyan-600", initials: "HG" },
  hotelbeds: { label: "HotelBeds", color: "bg-amber-600", initials: "HB" },
  manual: { label: "Manual", color: "bg-muted-foreground", initials: "M" },
};

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

export const ALL_CHANNELS = Object.keys(CHANNEL_CONFIG).filter((c) => c !== "manual");
