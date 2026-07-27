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

  // Only mount Google reCAPTCHA on canonical production hosts. Preview/local
  // bypass and white-label bridge modes must not load Google's domain-bound script.
  if (mode !== "native" || isLoading || !siteKey) {
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