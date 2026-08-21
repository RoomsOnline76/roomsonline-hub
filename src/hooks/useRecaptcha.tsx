import { useState, useCallback, useEffect, useRef } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { useRecaptchaSiteKey as useRecaptchaSiteKeyFromFlags } from "@/hooks/useFeatureFlags";
import {
  getRecaptchaMode,
  getEffectiveRecaptchaMode,
  markNativeRecaptchaFailed,
  isRecaptchaBypassHost,
  RECAPTCHA_BRIDGE_URL,
  RECAPTCHA_BYPASS_TOKEN,
} from "@/lib/recaptchaMode";


interface RecaptchaState {
  isVerified: boolean;
  isVerifying: boolean;
  token: string | null;
  error: string | null;
}

export function useRecaptchaSiteKey() {
  const { siteKey, isLoading } = useRecaptchaSiteKeyFromFlags();
  return {
    data: siteKey,
    isLoading,
    error: null,
  };
}

// ── Bridge-mode singleton iframe ─────────────────────────────────────────────
// On white-label / embed hosts the site key is not valid for the current
// domain, so we mint tokens through a hidden iframe pointed at a canonical
// Rooms Online host. A single iframe is reused for the lifetime of the page.

interface PendingRequest {
  resolve: (token: string | null) => void;
}

let bridgeIframe: HTMLIFrameElement | null = null;
let bridgeReady = false;
let bridgeReadyWaiters: Array<() => void> = [];
const pending = new Map<string, PendingRequest>();

function ensureBridge(): HTMLIFrameElement | null {
  if (typeof window === "undefined") return null;
  if (bridgeIframe) return bridgeIframe;

  const iframe = document.createElement("iframe");
  iframe.src = RECAPTCHA_BRIDGE_URL;
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.style.position = "absolute";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.left = "-9999px";
  iframe.style.top = "-9999px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);
  bridgeIframe = iframe;

  window.addEventListener("message", (ev) => {
    const data = ev.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "rc:ready") {
      bridgeReady = true;
      const waiters = bridgeReadyWaiters;
      bridgeReadyWaiters = [];
      waiters.forEach((w) => w());
      return;
    }
    if (data.type === "rc:token" && typeof data.nonce === "string") {
      const req = pending.get(data.nonce);
      if (req) {
        pending.delete(data.nonce);
        req.resolve(typeof data.token === "string" ? data.token : null);
      }
    }
  });

  return iframe;
}

function waitForBridgeReady(timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    if (bridgeReady) return resolve(true);
    const t = setTimeout(() => {
      bridgeReadyWaiters = bridgeReadyWaiters.filter((w) => w !== onReady);
      resolve(false);
    }, timeoutMs);
    const onReady = () => {
      clearTimeout(t);
      resolve(true);
    };
    bridgeReadyWaiters.push(onReady);
  });
}

async function requestBridgeToken(action: string, timeoutMs = 5000): Promise<string | null> {
  const iframe = ensureBridge();
  if (!iframe || !iframe.contentWindow) return null;
  const ok = await waitForBridgeReady(timeoutMs);
  if (!ok) return null;
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      pending.delete(nonce);
      resolve(null);
    }, timeoutMs);
    pending.set(nonce, {
      resolve: (token) => {
        clearTimeout(t);
        resolve(token);
      },
    });
    iframe.contentWindow?.postMessage({ type: "rc:execute", action, nonce }, "*");
  });
}

// ── Public hook ──────────────────────────────────────────────────────────────

// ── Native execution with automatic bridge fallback ─────────────────────────
// A wrong key/domain pairing on the current host (Google: "Invalid domain for
// site key") makes native execution throw or return nothing. Rather than
// blocking sign-in, latch the failure and mint the token through the canonical
// host bridge instead.

async function executeNativeOrBridge(
  action: string,
  executeRecaptcha: ((action: string) => Promise<string>) | undefined,
): Promise<string | null> {
  if (getEffectiveRecaptchaMode() === "bridge") {
    return requestBridgeToken(action);
  }
  if (!executeRecaptcha) return null;
  try {
    const token = await executeRecaptcha(action);
    if (token) return token;
    markNativeRecaptchaFailed("empty token");
  } catch (err) {
    markNativeRecaptchaFailed(err);
  }
  return requestBridgeToken(action);
}

export function useRecaptcha(action: string = "submit", scoreThreshold: number = 0.5) {
  const { executeRecaptcha } = useGoogleReCaptcha();
  const mode = getRecaptchaMode();
  const [state, setState] = useState<RecaptchaState>({
    isVerified: false,
    isVerifying: false,
    token: null,
    error: null,
  });

  // Prime the bridge iframe on mount so the first `verify()` is snappy.
  useEffect(() => {
    if (getEffectiveRecaptchaMode() === "bridge") ensureBridge();
  }, [mode]);

  const verify = useCallback(async () => {
    setState((prev) => ({ ...prev, isVerifying: true, error: null }));

    try {
      let token: string | null = null;

      if (mode === "bypass") {
        token = RECAPTCHA_BYPASS_TOKEN;
      } else if (mode === "bridge") {
        token = await requestBridgeToken(action);
      } else {
        if (!executeRecaptcha && getEffectiveRecaptchaMode() === "native") {
          console.warn("reCAPTCHA not yet available");
          setState((prev) => ({ ...prev, isVerifying: false, error: "reCAPTCHA not ready" }));
          return false;
        }
        token = await executeNativeOrBridge(action, executeRecaptcha);
      }

      if (token) {
        setState({ isVerified: true, isVerifying: false, token, error: null });
        return true;
      }
      setState((prev) => ({
        ...prev,
        isVerifying: false,
        error: "Failed to get verification token",
      }));
      return false;
    } catch (error) {
      console.error("reCAPTCHA verification error:", error);
      setState((prev) => ({ ...prev, isVerifying: false, error: "Verification failed" }));
      return false;
    }
  }, [executeRecaptcha, action, mode]);

  const reset = useCallback(() => {
    setState({ isVerified: false, isVerifying: false, token: null, error: null });
  }, []);


  return {
    ...state,
    verify,
    reset,
    isReady: mode === "bypass" ? true : mode === "bridge" ? true : !!executeRecaptcha,
  };
}

// Auto-verify hook for login page
export function useAutoRecaptcha(action: string = "login") {
  const { executeRecaptcha } = useGoogleReCaptcha();
  const mode = getRecaptchaMode();
  const bypass = mode === "bypass";
  const [state, setState] = useState<RecaptchaState & { hasAttempted: boolean }>({
    isVerified: bypass,
    isVerifying: !bypass,
    token: bypass ? RECAPTCHA_BYPASS_TOKEN : null,
    error: null,
    hasAttempted: bypass,
  });

  useEffect(() => {
    if (!bypass) return;
    setState({
      isVerified: true,
      isVerifying: false,
      token: RECAPTCHA_BYPASS_TOKEN,
      error: null,
      hasAttempted: true,
    });
  }, [bypass]);

  useEffect(() => {
    if (bypass || !executeRecaptcha || state.hasAttempted) return;

    const runVerification = async () => {
      try {
        const token = await executeRecaptcha(action);
        
        if (token) {
          setState({
            isVerified: true,
            isVerifying: false,
            token,
            error: null,
            hasAttempted: true,
          });
        } else {
          setState(prev => ({
            ...prev,
            isVerifying: false,
            error: "Verification failed",
            hasAttempted: true,
          }));
        }
      } catch (error) {
        console.error("Auto reCAPTCHA verification error:", error);
        setState(prev => ({
          ...prev,
          isVerifying: false,
          error: "Verification failed",
          hasAttempted: true,
        }));
      }
    };

    runVerification();
  }, [executeRecaptcha, action, state.hasAttempted, bypass]);

  const retry = useCallback(async () => {
    if (bypass || isRecaptchaBypassHost()) {
      setState({ isVerified: true, isVerifying: false, token: RECAPTCHA_BYPASS_TOKEN, error: null, hasAttempted: true });
      return true;
    }
    if (!executeRecaptcha) return false;
    
    
    setState(prev => ({ ...prev, isVerifying: true, error: null }));
    
    try {
      const token = await executeRecaptcha(action);
      
      if (token) {
        setState({
          isVerified: true,
          isVerifying: false,
          token,
          error: null,
          hasAttempted: true,
        });
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isVerifying: false,
          error: "Verification failed",
        }));
        return false;
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isVerifying: false,
        error: "Verification failed",
      }));
      return false;
    }
  }, [executeRecaptcha, action, bypass]);

  return {
    ...state,
    retry,
    isReady: bypass ? true : !!executeRecaptcha,
  };
}