import type { PaymentGateway } from "@/hooks/useActivePaymentGateway";
import { cn } from "@/lib/utils";
import { CreditCard, Globe, MapPin, QrCode, Wallet } from "lucide-react";

// ── Gateway display metadata ────────────────────────────────────────────────

interface GatewayMeta {
  label: string;
  region: "sa" | "international";
  icon: "card" | "wallet" | "qr" | "globe";
  tagline?: string;
}

const GATEWAY_DISPLAY: Record<PaymentGateway, GatewayMeta> = {
  payfast:      { label: "PayFast",        region: "sa",            icon: "card",   tagline: "Cards, EFT, Mobicred" },
  paygate:      { label: "PayGate",        region: "sa",            icon: "card",   tagline: "Cards & EFT" },
  peach:        { label: "Peach Payments", region: "sa",            icon: "card",   tagline: "Cards & mobile" },
  yoco:         { label: "Yoco",           region: "sa",            icon: "card",   tagline: "Cards" },
  ozow:         { label: "Ozow",           region: "sa",            icon: "wallet", tagline: "Instant EFT" },
  dpo:          { label: "DPO Pay",        region: "sa",            icon: "card",   tagline: "Multi-currency" },
  addpay:       { label: "AddPay",         region: "sa",            icon: "card",   tagline: "Cards & vouchers" },
  payflex:      { label: "Payflex",        region: "sa",            icon: "wallet", tagline: "Buy now, pay later" },
  stitch:       { label: "Stitch",         region: "sa",            icon: "wallet", tagline: "Instant payments" },
  ikhokha:      { label: "iKhokha",        region: "sa",            icon: "card",   tagline: "Online payments" },
  snapscan:     { label: "SnapScan",       region: "sa",            icon: "qr",     tagline: "Scan & pay" },
  zapper:       { label: "Zapper",         region: "sa",            icon: "qr",     tagline: "Scan & pay" },
  flutterwave:  { label: "Flutterwave",    region: "international", icon: "globe",  tagline: "Africa & global" },
  stripe:       { label: "Stripe",         region: "international", icon: "card",   tagline: "Cards worldwide" },
  paypal:       { label: "PayPal",         region: "international", icon: "wallet", tagline: "Global payments" },
  klarna:       { label: "Klarna",         region: "international", icon: "wallet", tagline: "Buy now, pay later" },
  affirm:       { label: "Affirm",         region: "international", icon: "wallet", tagline: "Buy now, pay later" },
};

const ICON_MAP = {
  card:   CreditCard,
  wallet: Wallet,
  qr:     QrCode,
  globe:  Globe,
};

// ── Component ───────────────────────────────────────────────────────────────

interface PaymentMethodSelectorProps {
  gateways: PaymentGateway[];
  selected: PaymentGateway | null;
  onSelect: (gateway: PaymentGateway) => void;
}

/**
 * Guest-facing payment method picker.
 * Groups available gateways by SA / International.
 * If only 1 gateway is available, this component should not be rendered.
 */
export function PaymentMethodSelector({ gateways, selected, onSelect }: PaymentMethodSelectorProps) {
  const saGateways = gateways.filter(g => GATEWAY_DISPLAY[g]?.region === "sa");
  const intlGateways = gateways.filter(g => GATEWAY_DISPLAY[g]?.region === "international");

  const renderGateway = (gw: PaymentGateway) => {
    const meta = GATEWAY_DISPLAY[gw];
    if (!meta) return null;
    const Icon = ICON_MAP[meta.icon];
    const isActive = selected === gw;

    return (
      <button
        key={gw}
        type="button"
        onClick={() => onSelect(gw)}
        className={cn(
          "flex items-center gap-3 w-full rounded-xl border p-3 text-left transition-all",
          isActive
            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
            : "border-border/50 hover:border-border hover:bg-muted/30"
        )}
      >
        <div className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
          isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{meta.label}</p>
          {meta.tagline && (
            <p className="text-[11px] text-muted-foreground">{meta.tagline}</p>
          )}
        </div>
        <div className={cn(
          "h-4 w-4 rounded-full border-2 shrink-0 transition-colors",
          isActive ? "border-primary bg-primary" : "border-muted-foreground/30"
        )}>
          {isActive && (
            <div className="h-full w-full flex items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
            </div>
          )}
        </div>
      </button>
    );
  };

  const renderGroup = (label: string, icon: React.ReactNode, items: PaymentGateway[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
          {icon}
          <span>{label}</span>
        </div>
        <div className="space-y-1.5">
          {items.map(renderGateway)}
        </div>
      </div>
    );
  };

  // If all same region, no need for headers
  const showHeaders = saGateways.length > 0 && intlGateways.length > 0;

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Choose payment method</p>
      {showHeaders ? (
        <div className="space-y-3">
          {renderGroup("South African", <MapPin className="h-3 w-3" />, saGateways)}
          {renderGroup("International", <Globe className="h-3 w-3" />, intlGateways)}
        </div>
      ) : (
        <div className="space-y-1.5">
          {gateways.map(renderGateway)}
        </div>
      )}
    </div>
  );
}
