import { useState, useCallback, useEffect } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { useRecaptchaSiteKey as useRecaptchaSiteKeyFromFlags } from "@/hooks/useFeatureFlags";

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

export function useRecaptcha(action: string = "submit", scoreThreshold: number = 0.5) {
  const { executeRecaptcha } = useGoogleReCaptcha();
  const [state, setState] = useState<RecaptchaState>({
    isVerified: false,
    isVerifying: false,
    token: null,
    error: null,
  });

  const verify = useCallback(async () => {
    if (!executeRecaptcha) {
      console.warn("reCAPTCHA not yet available");
      setState(prev => ({ ...prev, error: "reCAPTCHA not ready" }));
      return false;
    }

    setState(prev => ({ ...prev, isVerifying: true, error: null }));

    try {
      const token = await executeRecaptcha(action);
      
      if (token) {
        setState({
          isVerified: true,
          isVerifying: false,
          token,
          error: null,
        });
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isVerifying: false,
          error: "Failed to get verification token",
        }));
        return false;
      }
    } catch (error) {
      console.error("reCAPTCHA verification error:", error);
      setState(prev => ({
        ...prev,
        isVerifying: false,
        error: "Verification failed",
      }));
      return false;
    }
  }, [executeRecaptcha, action]);

  const reset = useCallback(() => {
    setState({
      isVerified: false,
      isVerifying: false,
      token: null,
      error: null,
    });
  }, []);

  return {
    ...state,
    verify,
    reset,
    isReady: !!executeRecaptcha,
  };
}

// Auto-verify hook for login page
export function useAutoRecaptcha(action: string = "login") {
  const { executeRecaptcha } = useGoogleReCaptcha();
  const [state, setState] = useState<RecaptchaState & { hasAttempted: boolean }>({
    isVerified: false,
    isVerifying: true,
    token: null,
    error: null,
    hasAttempted: false,
  });

  useEffect(() => {
    if (!executeRecaptcha || state.hasAttempted) return;

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
  }, [executeRecaptcha, action, state.hasAttempted]);

  const retry = useCallback(async () => {
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
  }, [executeRecaptcha, action]);

  return {
    ...state,
    retry,
    isReady: !!executeRecaptcha,
  };
}