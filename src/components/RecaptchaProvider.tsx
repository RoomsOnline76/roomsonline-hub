import { ReactNode } from "react";
import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";
import { useRecaptchaSiteKey } from "@/hooks/useRecaptcha";
import { getRecaptchaMode } from "@/lib/recaptchaMode";

interface RecaptchaProviderProps {
  children: ReactNode;
}

export function RecaptchaProvider({ children }: RecaptchaProviderProps) {
  const { data: siteKey, isLoading } = useRecaptchaSiteKey();
  const mode = getRecaptchaMode();

  // On white-label / embedded hosts the site key is not valid for the current
  // domain; mounting the provider would emit "Invalid domain for site key"
  // errors. Skip native mount — `useRecaptcha` falls back to the bridge iframe.
  if (mode === "bridge" || isLoading || !siteKey) {
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