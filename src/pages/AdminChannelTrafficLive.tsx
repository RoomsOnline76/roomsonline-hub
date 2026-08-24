import { LiveTrafficFrame } from "@/components/admin/channel-monitor/live/LiveTrafficFrame";

/**
 * Standalone window target for the live traffic monitor. Opened with `window.open` from the
 * Advanced tab so it can be kept on top of the workspace while an engineer drives a push.
 */
export default function AdminChannelTrafficLive() {
  return (
    <div className="min-h-screen bg-background p-4">
      <LiveTrafficFrame popped />
    </div>
  );
}
