import { useEffect, useState } from "react";
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { useRecaptchaSiteKey } from "@/hooks/useRecaptcha";

/**
 * Hidden bridge page hosted on a canonical Rooms Online domain (where the
 * reCAPTCHA site key is valid). Parent windows on white-label domains embed
 * this route inside a hidden iframe and request tokens via `postMessage`.
 *
 * Protocol:
 *   parent → iframe : { type: "rc:execute", action: string, nonce: string }
 *   iframe → parent : { type: "rc:token", token: string|null, nonce: string, error?: string }
 *
 * The bridge does not restrict which parent origins may request tokens (any
 * embed/white-label host is allowed) — the token itself is only useful to
 * server-side verifiers that already validate the request, and reCAPTCHA v3
 * scoring provides the anti-abuse signal.
 */

const ALLOWED_ACTIONS = new Set([
  "submit",
  "booking",
  "contact",
  "signup",
  "login",
  "portfolio_booking",
]);

function BridgeInner() {
  const { executeRecaptcha } = useGoogleReCaptcha();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!executeRecaptcha) return;
    setReady(true);
    // Notify parent we are ready to accept requests.
    if (window.parent !== window) {
      window.parent.postMessage({ type: "rc:ready" }, "*");
    }
  }, [executeRecaptcha]);

  useEffect(() => {
    if (!executeRecaptcha) return;

    const onMessage = async (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data !== "object" || data.type !== "rc:execute") return;
      const action = typeof data.action === "string" ? data.action : "submit";
      const nonce = typeof data.nonce === "string" ? data.nonce : "";
      const safeAction = ALLOWED_ACTIONS.has(action) ? action : "submit";

      try {
        const token = await executeRecaptcha(safeAction);
        (ev.source as Window | null)?.postMessage(
          { type: "rc:token", token, nonce },
          { targetOrigin: ev.origin || "*" } as WindowPostMessageOptions,
        );
      } catch (err) {
        (ev.source as Window | null)?.postMessage(
          { type: "rc:token", token: null, nonce, error: String(err) },
          { targetOrigin: ev.origin || "*" } as WindowPostMessageOptions,
        );
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [executeRecaptcha]);

  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", fontSize: 12, color: "#666" }}>
      {ready ? "reCAPTCHA bridge ready" : "Loading reCAPTCHA…"}
    </div>
  );
}

export default function RecaptchaBridge() {
  const { data: siteKey, isLoading } = useRecaptchaSiteKey();

  if (isLoading) {
    return <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", fontSize: 12 }}>Loading…</div>;
  }
  if (!siteKey) {
    return <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", fontSize: 12 }}>reCAPTCHA is not configured.</div>;
  }

  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={siteKey}
      scriptProps={{ async: true, defer: true, appendTo: "head" }}
    >
      <BridgeInner />
    </GoogleReCaptchaProvider>
  );
}
