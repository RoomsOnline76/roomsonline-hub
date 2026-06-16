import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChannelLogo, getChannelLabel } from "./ChannelLogo";

interface ConnectChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelName: string;
  onSubmit: (credentials: Record<string, string>, settings: Record<string, unknown>) => void;
  loading?: boolean;
}

const CHANNEL_FIELDS: Record<string, { key: string; label: string; type?: string; optional?: boolean; help?: string }[]> = {
  booking_com: [
    { key: "hotel_id", label: "Booking.com Hotel ID" },
    {
      key: "hyperguest_property_id",
      label: "HyperGuest Property ID (optional)",
      optional: true,
      help: "If this property is also distributed via HyperGuest, paste the HG property ID here. ROL'OS will tunnel live ARI through HyperGuest instead of polling Booking.com directly.",
    },
  ],
  airbnb: [
    { key: "listing_id", label: "Listing ID" },
  ],
  expedia: [
    { key: "property_id", label: "Property ID" },
  ],
  agoda: [
    { key: "hotel_id", label: "Hotel ID" },
  ],
  google_hotels: [
    { key: "partner_id", label: "Partner ID" },
  ],
  lekkeslaap: [
    { key: "property_id", label: "Property ID" },
  ],
  nightsbridge: [
    { key: "bbid", label: "Property ID (BBID)" },
  ],
};

export function ConnectChannelDialog({ open, onOpenChange, channelName, onSubmit, loading }: ConnectChannelDialogProps) {
  const fields = CHANNEL_FIELDS[channelName] ?? [];
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [syncInterval, setSyncInterval] = useState("15");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(credentials, {
      auto_confirm: autoConfirm,
      sync_interval_minutes: parseInt(syncInterval, 10) || 15,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <ChannelLogo channelName={channelName} size="md" />
            <div>
              <DialogTitle>Connect {getChannelLabel(channelName)}</DialogTitle>
              <DialogDescription>Enter your API credentials to enable synchronisation.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                type={field.type ?? "text"}
                value={credentials[field.key] ?? ""}
                onChange={(e) => setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))}
                required
              />
            </div>
          ))}

          <div className="border-t border-border pt-4 space-y-3">
            <h4 className="text-sm font-medium text-foreground">Sync Settings</h4>
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-confirm" className="text-sm text-muted-foreground">Auto-confirm reservations</Label>
              <Switch id="auto-confirm" checked={autoConfirm} onCheckedChange={setAutoConfirm} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sync-interval">Sync interval (minutes)</Label>
              <Input
                id="sync-interval"
                type="number"
                min="5"
                max="60"
                value={syncInterval}
                onChange={(e) => setSyncInterval(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Connecting…" : "Connect"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
