import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChannelLogo, getChannelLabel } from "./ChannelLogo";
import { MoreHorizontal, Plug, Pause, Play, Unplug, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const CHANNEL_DESCRIPTIONS: Record<string, string> = {
  booking_com: "World's largest OTA — sync availability, rates & reservations.",
  airbnb: "Vacation rental marketplace — manage listings & guest comms.",
  expedia: "Global travel platform — distribute inventory across Expedia Group brands.",
  agoda: "Asia-focused OTA — reach travellers across APAC markets.",
  google_hotels: "Surface rates on Google Search, Maps & Google Travel via Hotel Ads.",
  lekkeslaap: "South Africa's leading accommodation platform — reach local travellers.",
  nightsbridge: "Channel manager & booking platform for Southern African properties.",
};

interface ChannelConnection {
  id: string;
  channel_name: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  room_mapping_count?: number;
  rate_mapping_count?: number;
}

const STATUS_BADGES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  active: { variant: "default", label: "Active" },
  paused: { variant: "secondary", label: "Paused" },
  error: { variant: "destructive", label: "Error" },
  disconnected: { variant: "outline", label: "Disconnected" },
};

export function ChannelCard({
  connection,
  channelName: channelNameProp,
  onConnect,
  onPause,
  onResume,
  onDisconnect,
  onSync,
  isConnected,
  readOnly,
}: {
  connection?: ChannelConnection;
  channelName?: string;
  onConnect: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onDisconnect?: () => void;
  onSync?: () => void;
  isConnected: boolean;
  readOnly?: boolean;
}) {
  const channelName = connection?.channel_name || channelNameProp || "";
  const status = connection?.status ?? "disconnected";
  const badge = STATUS_BADGES[status] ?? STATUS_BADGES.disconnected;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <ChannelLogo channelName={channelName} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-foreground truncate">{getChannelLabel(channelName)}</h3>
              <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
            </div>

            {isConnected && connection ? (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  {connection.last_sync_at
                    ? `Last synced ${formatDistanceToNow(new Date(connection.last_sync_at), { addSuffix: true })}`
                    : "Never synced"}
                </p>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{connection.room_mapping_count ?? 0} rooms mapped</span>
                  <span>{connection.rate_mapping_count ?? 0} rates mapped</span>
                </div>
                {connection.last_error && status === "error" && (
                  <p className="text-xs text-destructive mt-1 truncate" title={connection.last_error}>
                    {connection.last_error}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {CHANNEL_DESCRIPTIONS[channelName] ?? "Not connected"}
              </p>
            )}
          </div>

          {!readOnly && (
            <div className="shrink-0">
              {isConnected ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onSync && (
                      <DropdownMenuItem onClick={onSync}>
                        <RefreshCw className="h-4 w-4 mr-2" /> Sync Now
                      </DropdownMenuItem>
                    )}
                    {status === "active" && onPause && (
                      <DropdownMenuItem onClick={onPause}>
                        <Pause className="h-4 w-4 mr-2" /> Pause
                      </DropdownMenuItem>
                    )}
                    {status === "paused" && onResume && (
                      <DropdownMenuItem onClick={onResume}>
                        <Play className="h-4 w-4 mr-2" /> Resume
                      </DropdownMenuItem>
                    )}
                    {onDisconnect && (
                      <DropdownMenuItem onClick={onDisconnect} className="text-destructive">
                        <Unplug className="h-4 w-4 mr-2" /> Disconnect
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button size="sm" onClick={onConnect}>
                  <Plug className="h-4 w-4 mr-1.5" /> Connect
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
