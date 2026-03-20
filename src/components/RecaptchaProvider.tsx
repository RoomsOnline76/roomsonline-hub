import { ReactNode } from "react";
import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";
import { useRecaptchaSiteKey } from "@/hooks/useRecaptcha";
import { isConnectDomain } from "@/lib/config";

interface RecaptchaProviderProps {
  children: ReactNode;
}

export function RecaptchaProvider({ children }: RecaptchaProviderProps) {
  const { data: siteKey, isLoading } = useRecaptchaSiteKey();

  // Don't load reCAPTCHA on the connect domain (not registered there)
  if (isConnectDomain || isLoading || !siteKey) {
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