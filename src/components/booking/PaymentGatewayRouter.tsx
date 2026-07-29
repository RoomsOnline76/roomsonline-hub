import { PayFastOnsiteModal } from "./PayFastOnsiteModal";
import { PayGateRedirect } from "./PayGateRedirect";
import { StripeCheckout } from "./StripeCheckout";
import { GenericRedirectGateway } from "./GenericRedirectGateway";
import type { PaymentGateway } from "@/hooks/useActivePaymentGateway";

// ── Gateway metadata for the router ──────────────────────────────────────────

const GATEWAY_META: Record<string, { label: string; edgeFunction: string }> = {
  paypal: { label: "PayPal", edgeFunction: "paypal-gateway" },
  flutterwave: { label: "Flutterwave", edgeFunction: "flutterwave-gateway" },
  peach: { label: "Peach Payments", edgeFunction: "peach-gateway" },
  yoco: { label: "Yoco", edgeFunction: "yoco-gateway" },
  ozow: { label: "Ozow", edgeFunction: "ozow-gateway" },
  dpo: { label: "DPO Pay", edgeFunction: "dpo-gateway" },
  addpay: { label: "AddPay", edgeFunction: "addpay-gateway" },
  payflex: { label: "Payflex", edgeFunction: "payflex-gateway" },
  stitch: { label: "Stitch", edgeFunction: "stitch-gateway" },
  ikhokha: { label: "iKhokha", edgeFunction: "ikhokha-gateway" },
  snapscan: { label: "SnapScan", edgeFunction: "snapscan-gateway" },
  zapper: { label: "Zapper", edgeFunction: "zapper-gateway" },
  klarna: { label: "Klarna", edgeFunction: "klarna-gateway" },
  affirm: { label: "Affirm", edgeFunction: "affirm-gateway" },
};

// ── Router Props ─────────────────────────────────────────────────────────────

interface PaymentGatewayRouterProps {
  gateway: PaymentGateway;
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  amount: number;
  propertyName: string;
  propertyId?: string;
  currency?: string;
  isSandbox?: boolean;
  credentialSource?: string | null;
  uuid?: string;
  /** Called when PayFast/Stripe modal payment succeeds (non-redirect gateways) */
  onPaymentSuccess?: () => void;
  /** Called when user cancels in PayFast modal */
  onPaymentCancelled?: () => void;
  /** Called when a redirect gateway has initiated (user is being redirected) */
  onPaymentInitiated?: () => void;
}

/**
 * Unified payment gateway router.
 * Routes to the correct gateway component based on the active gateway key.
 *
 * Replaces scattered PayFast/PayGate if/else blocks across booking pages.
 */
export function PaymentGatewayRouter({
  gateway,
  isOpen,
  onClose,
  bookingId,
  amount,
  propertyName,
  propertyId,
  currency = "ZAR",
  isSandbox,
  credentialSource,
  uuid,
  onPaymentSuccess,
  onPaymentCancelled,
  onPaymentInitiated,
}: PaymentGatewayRouterProps) {
  // ── PayFast (modal-based) ───────────────────────────────────────────────
  if (gateway === "payfast") {
    return (
      <PayFastOnsiteModal
        isOpen={isOpen}
        onClose={onClose}
        onPaymentSuccess={onPaymentSuccess || (() => {})}
        onPaymentCancelled={onPaymentCancelled || (() => {})}
        bookingId={bookingId}
        amount={amount}
        propertyName={propertyName}
        isSandbox={isSandbox}
        credentialSource={credentialSource}
        uuid={uuid}
      />
    );
  }

  // ── PayGate (redirect-based, custom form POST) ──────────────────────────
  if (gateway === "paygate") {
    return (
      <PayGateRedirect
        isOpen={isOpen}
        onClose={onClose}
        onPaymentInitiated={onPaymentInitiated || (() => {})}
        bookingId={bookingId}
        amount={amount}
        propertyName={propertyName}
      />
    );
  }

  // ── Stripe (redirect to Stripe Checkout) ────────────────────────────────
  if (gateway === "stripe") {
    return (
      <StripeCheckout
        isOpen={isOpen}
        onClose={onClose}
        onPaymentInitiated={onPaymentInitiated || (() => {})}
        bookingId={bookingId}
        amount={amount}
        propertyName={propertyName}
        propertyId={propertyId}
        currency={currency}
      />
    );
  }

  // ── All other redirect-based gateways ───────────────────────────────────
  const meta = GATEWAY_META[gateway];
  if (meta) {
    return (
      <GenericRedirectGateway
        isOpen={isOpen}
        onClose={onClose}
        onPaymentInitiated={onPaymentInitiated || (() => {})}
        bookingId={bookingId}
        amount={amount}
        propertyName={propertyName}
        propertyId={propertyId}
        gateway={gateway}
        gatewayLabel={meta.label}
        edgeFunctionName={meta.edgeFunction}
        currency={currency}
      />
    );
  }

  // ── Fallback to PayFast ─────────────────────────────────────────────────
  return (
    <PayFastOnsiteModal
      isOpen={isOpen}
      onClose={onClose}
      onPaymentSuccess={onPaymentSuccess || (() => {})}
      onPaymentCancelled={onPaymentCancelled || (() => {})}
      bookingId={bookingId}
      amount={amount}
      propertyName={propertyName}
      isSandbox={isSandbox}
      credentialSource={credentialSource}
      uuid={uuid}
    />
  );
}
