import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PropertyOnboardingWizard } from "@/components/onboarding/PropertyOnboardingWizard";
import { Loader2, AlertTriangle, Lock, Mail, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import rolLogo from "@/assets/rol-logo.png";
import { format } from "date-fns";

interface TokenData {
  id: string;
  property_id: string;
  owner_email: string;
  expires_at: string;
  used_at: string | null;
}

type ErrorType = "invalid" | "expired" | "used" | "wrong_email" | "generic";

interface ErrorState {
  type: ErrorType;
  message: string;
  ownerEmail?: string;
  expiresAt?: string;
  userEmail?: string;
}

export default function PropertyOnboarding() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [showAuthScreen, setShowAuthScreen] = useState(false);

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError({
          type: "invalid",
          message: "This onboarding link is not valid. Please check your email for the correct link or contact us for assistance."
        });
        setIsLoading(false);
        return;
      }

      try {
        // Server-side lookup: the invitation row is only ever returned for the
        // exact token in the link — the table itself is not publicly readable.
        const { data: rows, error: fetchError } = await supabase.rpc(
          "validate_onboarding_token",
          { _token: token },
        );
        const data = Array.isArray(rows) ? rows[0] : null;

        if (fetchError || !data) {
          setError({
            type: "invalid",
            message: "This onboarding link is no longer valid. Please contact sleepinafrica@roomsonline.co.za to request a new invitation."
          });
          setIsLoading(false);
          return;
        }


        // Check if expired
        if (new Date(data.expires_at) < new Date()) {
          setError({
            type: "expired",
            message: `Your onboarding invitation expired on ${format(new Date(data.expires_at), "MMMM d, yyyy")}. Contact sleepinafrica@roomsonline.co.za for a fresh link.`,
            expiresAt: data.expires_at
          });
          setIsLoading(false);
          return;
        }

        // Check if already used
        if (data.used_at) {
          setError({
            type: "used",
            message: "This property has already been set up. If you need to make changes, please contact your RoomsOnline representative."
          });
          setIsLoading(false);
          return;
        }

        setTokenData(data);
        setIsLoading(false);
      } catch (err) {
        console.error("Token validation error:", err);
        setError({
          type: "generic",
          message: "Something went wrong while validating your link. Please try again or contact support."
        });
        setIsLoading(false);
      }
    }

    validateToken();
  }, [token]);

  // Show auth screen if not logged in (instead of redirect)
  useEffect(() => {
    if (!authLoading && !user && tokenData) {
      setShowAuthScreen(true);
    }
  }, [authLoading, user, tokenData]);

  // Check if user email matches token
  useEffect(() => {
    if (user && tokenData && user.email !== tokenData.owner_email) {
      setError({
        type: "wrong_email",
        message: `You're logged in as ${user.email}, but this invitation was sent to ${tokenData.owner_email}. Please log out and sign in with the correct account.`,
        ownerEmail: tokenData.owner_email,
        userEmail: user.email || undefined
      });
    }
  }, [user, tokenData]);

  const handleComplete = async () => {
    if (tokenData) {
      await supabase
        .from("property_onboarding_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", tokenData.id);
    }
    navigate("/dashboard/reports");
  };

  const handleClose = () => {
    navigate("/dashboard/reports");
  };

  const handleContinueToLogin = () => {
    const returnUrl = `/onboarding/${token}`;
    navigate(`/auth?returnUrl=${encodeURIComponent(returnUrl)}`);
  };

  const handleLogout = async () => {
    await signOut();
    setError(null);
    const returnUrl = `/onboarding/${token}`;
    navigate(`/auth?returnUrl=${encodeURIComponent(returnUrl)}`);
  };

  // Loading states
  if (isLoading || authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-muted/30 to-background">
        <div className="flex flex-col items-center gap-4">
          <img src={rolLogo} alt="RoomsOnline" className="h-10 mb-2" />
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Validating your onboarding link...</p>
        </div>
      </div>
    );
  }

  // Auth required screen (branded interstitial instead of redirect)
  if (showAuthScreen && !user && tokenData) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-muted/30 to-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8">
            <div className="text-center">
              <img src={rolLogo} alt="RoomsOnline" className="h-12 mx-auto mb-6" />
              
              <div className="h-14 w-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="h-7 w-7 text-primary" />
              </div>
              
              <h1 className="text-xl font-semibold mb-2">Login Required</h1>
              <p className="text-muted-foreground mb-6">
                To complete your property onboarding, please log in with the email address this invitation was sent to:
              </p>
              
              <div className="flex items-center justify-center gap-2 bg-muted/50 rounded-lg py-3 px-4 mb-6">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{tokenData.owner_email}</span>
              </div>
              
              <Button onClick={handleContinueToLogin} size="lg" className="w-full">
                Continue to Login
              </Button>
              
              <div className="mt-6 pt-6 border-t">
                <p className="text-sm text-muted-foreground">
                  Need help? Contact{" "}
                  <a href="mailto:sleepinafrica@roomsonline.co.za" className="text-primary hover:underline">
                    sleepinafrica@roomsonline.co.za
                  </a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error states with specific messaging
  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-muted/30 to-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8">
            <div className="text-center">
              <img src={rolLogo} alt="RoomsOnline" className="h-12 mx-auto mb-6" />
              
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              
              <h1 className="text-xl font-semibold mb-2">
                {error.type === "invalid" && "Invalid Link"}
                {error.type === "expired" && "Link Expired"}
                {error.type === "used" && "Already Completed"}
                {error.type === "wrong_email" && "Wrong Account"}
                {error.type === "generic" && "Something Went Wrong"}
              </h1>
              
              <p className="text-muted-foreground mb-6">{error.message}</p>
              
              {error.type === "wrong_email" && (
                <div className="space-y-3 mb-6">
                  <Button onClick={handleLogout} variant="default" className="w-full">
                    <LogOut className="h-4 w-4 mr-2" />
                    Log Out & Switch Account
                  </Button>
                </div>
              )}
              
              {error.type !== "wrong_email" && (
                <Button onClick={() => navigate("/auth")} variant="outline">
                  Go to Login
                </Button>
              )}
              
              <div className="mt-6 pt-6 border-t">
                <p className="text-sm text-muted-foreground">
                  Need help? Contact{" "}
                  <a href="mailto:sleepinafrica@roomsonline.co.za" className="text-primary hover:underline">
                    sleepinafrica@roomsonline.co.za
                  </a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Waiting for auth (shouldn't reach here normally)
  if (!user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-muted/30 to-background">
        <div className="flex flex-col items-center gap-4">
          <img src={rolLogo} alt="RoomsOnline" className="h-10 mb-2" />
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Preparing your onboarding...</p>
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
        ownerEmail={tokenData.owner_email}
        onComplete={handleComplete}
        onClose={handleClose}
      />
    );
  }

  return null;
}
