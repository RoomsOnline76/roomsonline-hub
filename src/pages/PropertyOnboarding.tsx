import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PropertyOnboardingWizard } from "@/components/onboarding/PropertyOnboardingWizard";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TokenData {
  id: string;
  property_id: string;
  owner_email: string;
  expires_at: string;
  used_at: string | null;
}

export default function PropertyOnboarding() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError("Invalid onboarding link");
        setIsLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from("property_onboarding_tokens")
          .select("id, property_id, owner_email, expires_at, used_at")
          .eq("token", token)
          .single();

        if (fetchError || !data) {
          setError("Invalid or expired onboarding link");
          setIsLoading(false);
          return;
        }

        // Check if expired
        if (new Date(data.expires_at) < new Date()) {
          setError("This onboarding link has expired. Please request a new one.");
          setIsLoading(false);
          return;
        }

        // Check if already used
        if (data.used_at) {
          setError("This onboarding link has already been used.");
          setIsLoading(false);
          return;
        }

        setTokenData(data);
        setIsLoading(false);
      } catch (err) {
        console.error("Token validation error:", err);
        setError("Failed to validate onboarding link");
        setIsLoading(false);
      }
    }

    validateToken();
  }, [token]);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user && tokenData) {
      const returnUrl = `/onboarding/${token}`;
      navigate(`/auth?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  }, [authLoading, user, tokenData, token, navigate]);

  // Check if user email matches token
  useEffect(() => {
    if (user && tokenData && user.email !== tokenData.owner_email) {
      setError(`This onboarding link was sent to ${tokenData.owner_email}. Please log in with that email address.`);
    }
  }, [user, tokenData]);

  const handleComplete = async () => {
    // Mark token as used
    if (tokenData) {
      await supabase
        .from("property_onboarding_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", tokenData.id);
    }
    
    // Navigate to property page or dashboard
    navigate("/dashboard/reports");
  };

  const handleClose = () => {
    navigate("/dashboard/reports");
  };

  // Loading states
  if (isLoading || authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Validating onboarding link...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-md p-6">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h1 className="text-xl font-semibold">Unable to Continue</h1>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={() => navigate("/auth")} variant="outline">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  // Waiting for auth
  if (!user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Render wizard
  if (tokenData) {
    return (
      <PropertyOnboardingWizard
        propertyId={tokenData.property_id}
        mode="fullscreen"
        onComplete={handleComplete}
        onClose={handleClose}
      />
    );
  }

  return null;
}
