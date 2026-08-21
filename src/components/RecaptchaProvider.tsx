import { ReactNode, useEffect, useState } from "react";
import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";
import { useRecaptchaSiteKey } from "@/hooks/useRecaptcha";
import {
  getRecaptchaMode,
  hasNativeRecaptchaFailed,
  subscribeNativeRecaptchaFailure,
} from "@/lib/recaptchaMode";

interface RecaptchaProviderProps {
  children: ReactNode;
}

export function RecaptchaProvider({ children }: RecaptchaProviderProps) {
  const { data: siteKey, isLoading } = useRecaptchaSiteKey();
  const mode = getRecaptchaMode();
  const [nativeFailed, setNativeFailed] = useState(hasNativeRecaptchaFailed);

  useEffect(
    () => subscribeNativeRecaptchaFailure(() => setNativeFailed(true)),
    [],
  );

  // Only mount Google reCAPTCHA on canonical production hosts. Preview/local
  // bypass and white-label bridge modes must not load Google's domain-bound script.
  // If the native script failed for this host/key pairing, unmount it too so
  // Google's "ERROR for site owner" surface is never shown to users — the hook
  // falls back to the canonical-host token bridge.
  if (mode !== "native" || nativeFailed || isLoading || !siteKey) {
    return <>{children}</>;
  }

  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={siteKey}
      scriptProps={{
        async: true,
        defer: true,
        appendTo: "head",
      }}
    >
      {children}
    </GoogleReCaptchaProvider>
  );
}
