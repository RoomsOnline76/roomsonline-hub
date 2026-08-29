import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Send, ShieldCheck, CheckCircle2, ArrowLeft, Loader2, KeyRound, Home } from "lucide-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { RecaptchaOverlay } from "@/components/RecaptchaOverlay";
import { useAutoRecaptcha, useRecaptcha, useRecaptchaSiteKey } from "@/hooks/useRecaptcha";
import { getRecaptchaMode } from "@/lib/recaptchaMode";
import rolLogo from "@/assets/rol-logo.png";
import { isGuestBookingHost } from "@/lib/guestDomain";
import { GuestHostLanding } from "@/components/GuestHostLanding";


function AuthContent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [activeTab, setActiveTab] = useState("login");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotEmailSent, setForgotEmailSent] = useState(false);
  
  // Password reset state - check URL hash for recovery token on initial load
  // Use ref to track synchronously (prevents race condition with SIGNED_IN event)
  const initialRecoveryCheck = () => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    return hash.includes('type=recovery') || hash.includes('type=signup') || params.get('mode') === 'recovery';
  };
  const isRecoveryModeRef = useRef<boolean>(initialRecoveryCheck());
  const [isRecoveryMode, setIsRecoveryMode] = useState(isRecoveryModeRef.current);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Honeypot field (should remain empty)
  const [honeypot, setHoneypot] = useState("");
  
  // reCAPTCHA for login
  const loginRecaptcha = useAutoRecaptcha("login");
  const isRecaptchaBypass = getRecaptchaMode() === "bypass";
  
  // reCAPTCHA for request access
  const requestRecaptcha = useRecaptcha("request_access");

  const resolveAndRedirect = async (userId: string) => {
    try {
      // Check if user is a pure owner (only 'user' role) with a ROL property
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      
      const roleList = roles?.map(r => r.role) || [];
      const isPureOwner = roleList.length > 0 && roleList.every(r => r === "user");
      
      if (isPureOwner) {
        // Check property_owners table
        const { data: owned } = await supabase
          .from("property_owners")
          .select("property_id")
          .eq("user_id", userId);
        
        // Also check owner_email on properties
        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", userId)
          .single();

        const linkedIds = (owned || []).map(o => o.property_id);

        // Build query for ROL properties owned by this user (via property_owners OR owner_email)
        let query = supabase
          .from("properties")
          .select("id")
          .eq("is_rol_property", true)
          .limit(1);

        if (profile?.email && linkedIds.length > 0) {
          query = query.or(`owner_email.eq.${profile.email},id.in.(${linkedIds.join(",")})`);
        } else if (profile?.email) {
          query = query.eq("owner_email", profile.email);
        } else if (linkedIds.length > 0) {
          query = query.in("id", linkedIds);
        }

        const { data: rolProps } = await query;
        
        if (rolProps && rolProps.length > 0) {
          navigate(`/pms?property=${rolProps[0].id}`);
          return;
        }

        // Check if user is staff on any ROL property
        const { data: staffRecord } = await supabase
          .from("property_staff")
          .select("property_id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (staffRecord) {
          navigate(`/pms?property=${staffRecord.property_id}`);
          return;
        }
      }
      navigate("/");
    } catch {
      navigate("/");
    }
  };

  useEffect(() => {
    // On mount, try to detect recovery tokens in URL hash and exchange them
    // This handles the case where generateLink's action_link redirects with tokens
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token') || hash.includes('type=recovery'))) {
      // Supabase client should auto-detect these, but ensure it processes them
      console.log('Recovery hash detected, letting Supabase process tokens');
    }
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth event:', event, 'isRecoveryModeRef:', isRecoveryModeRef.current, 'hasSession:', !!session);
      
      // Check if this session is from a recovery flow
      const isRecoverySession = session?.user?.recovery_sent_at && 
        new Date(session.user.recovery_sent_at).getTime() > Date.now() - 1000 * 60 * 60; // Within last hour
      
      // Also check URL hash for recovery indicators
      const hashIndicatesRecovery = window.location.hash.includes('type=recovery') || new URLSearchParams(window.location.search).get('mode') === 'recovery';
      
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the password reset link - show password reset form
        isRecoveryModeRef.current = true;
        setIsRecoveryMode(true);
        toast({
          title: "Set your new password",
          description: "Please enter a new password below",
        });
      } else if (event === 'INITIAL_SESSION' && session && (hashIndicatesRecovery || isRecoveryModeRef.current)) {
        // Recovery flow - show password form, don't redirect
        console.log('INITIAL_SESSION in recovery flow - showing password form');
        isRecoveryModeRef.current = true;
        setIsRecoveryMode(true);
        toast({
          title: "Set your new password",
          description: "Please enter a new password below",
        });
      } else if (event === 'SIGNED_IN' && session && !isRecoveryModeRef.current && !hashIndicatesRecovery) {
        // Normal sign in (not during password recovery)
        toast({
          title: "Welcome back!",
          description: "Successfully logged in",
        });
        resolveAndRedirect(session.user.id);
      } else if (event === 'INITIAL_SESSION' && session && !isRecoveryModeRef.current && !hashIndicatesRecovery) {
        // Existing session on page load - redirect
        resolveAndRedirect(session.user.id);
      } else if (event === 'TOKEN_REFRESHED' && isRecoveryModeRef.current) {
        // Session refreshed during recovery - stay on recovery form
        console.log('Token refreshed during recovery flow - staying on form');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isRecaptchaBypass && !loginRecaptcha.isVerified) {
      toast({
        title: "Verification required",
        description: "Please wait for human verification to complete",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Welcome back!",
        description: "Successfully logged in",
      });
      // The onAuthStateChange SIGNED_IN handler will do the redirect
    }

    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.functions.invoke("forgot-password", {
        body: { email: forgotEmail.trim() },
      });

      if (error) throw error;

      setForgotEmailSent(true);
      toast({
        title: "Email sent",
        description: "Check your inbox for a password reset link",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Unable to send reset email",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same",
        variant: "destructive",
      });
      return;
    }
    
    if (newPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);

    try {
      // Check for active session first
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Try refreshing the session
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          toast({
            title: "Session expired",
            description: "Your password reset link has expired. Please request a new one.",
            variant: "destructive",
          });
          // Reset to show login/forgot password
          isRecoveryModeRef.current = false;
          setIsRecoveryMode(false);
          setShowForgotPassword(true);
          setLoading(false);
          return;
        }
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        // If session error, provide helpful message
        if (error.message?.toLowerCase().includes('session') || error.message?.toLowerCase().includes('auth')) {
          toast({
            title: "Session expired",
            description: "Your password reset link has expired. Please request a new one.",
            variant: "destructive",
          });
          isRecoveryModeRef.current = false;
          setIsRecoveryMode(false);
          setShowForgotPassword(true);
          setLoading(false);
          return;
        }
        throw error;
      }

      toast({
        title: "Password updated",
        description: "Your password has been reset successfully",
      });
      
      // Reset both ref and state
      isRecoveryModeRef.current = false;
      setIsRecoveryMode(false);
      setNewPassword("");
      setConfirmPassword("");
      navigate("/");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Unable to update password",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Honeypot check - if filled, it's likely a bot
    if (honeypot) {
      setShowSuccessModal(true);
      return;
    }
    
    // Verify reCAPTCHA if not already verified
    if (!requestRecaptcha.isVerified) {
      const verified = await requestRecaptcha.verify();
      if (!verified) {
        toast({
          title: "Verification failed",
          description: "Please try again",
          variant: "destructive",
        });
        return;
      }
    }
    
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-access-request", {
        body: {
          name: contactName.trim(),
          email: contactEmail.trim(),
          message: contactMessage.trim(),
          source_page: window.location.pathname,
          recaptchaToken: requestRecaptcha.token,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Clear form and show success modal
      setContactName("");
      setContactEmail("");
      setContactMessage("");
      requestRecaptcha.reset();
      setShowSuccessModal(true);
    } catch (error: any) {
      toast({
        title: "Submission failed",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setActiveTab("login");
  };

  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setForgotEmail("");
    setForgotEmailSent(false);
  };

  // Password Recovery Mode - User clicked reset link from email
  if (isRecoveryMode) {
    return (
      <PublicLayout hideFooter hideHeader hideJourneyBuilder>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <Link to="/" className="inline-flex items-center justify-center gap-3 mb-4 hover:opacity-80 transition-opacity">
                <img src={rolLogo} alt="RoomsOnline" className="h-12 w-auto" />
                <h1 className="font-display text-3xl font-light text-foreground">RoomsOnline</h1>
              </Link>
            </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <KeyRound className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Set New Password</CardTitle>
                  <CardDescription>Enter your new password below</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSetNewPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className={confirmPassword && newPassword !== confirmPassword ? "border-destructive" : ""}
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-sm text-destructive">Passwords do not match</p>
                  )}
                  {confirmPassword && newPassword === confirmPassword && confirmPassword.length >= 6 && (
                    <p className="text-sm text-green-600">Passwords match ✓</p>
                  )}
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Set Password & Login"
                  )}
                </Button>
              </form>
            </CardContent>
            </Card>
          </div>
        </div>
      </PublicLayout>
    );
  }

  // Forgot Password View
  if (showForgotPassword) {
    return (
      <PublicLayout hideFooter hideHeader hideJourneyBuilder>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <Link to="/" className="inline-flex items-center justify-center gap-3 mb-4 hover:opacity-80 transition-opacity">
                <img src={rolLogo} alt="RoomsOnline" className="h-12 w-auto" />
                <h1 className="font-display text-3xl font-light text-foreground">RoomsOnline</h1>
              </Link>
            </div>

          <Card>
            <CardHeader>
              <CardTitle>Reset Password</CardTitle>
              <CardDescription>
                {forgotEmailSent 
                  ? "Check your email for a password reset link"
                  : "Enter your email to receive a password reset link"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {forgotEmailSent ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center py-6">
                    <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                      <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-center text-muted-foreground">
                      If an account exists for <strong>{forgotEmail}</strong>, you'll receive an email with a password reset link.
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={handleBackToLogin}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Login
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="you@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>
                  <Button 
                    type="button"
                    variant="ghost" 
                    className="w-full" 
                    onClick={handleBackToLogin}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Login
                  </Button>
                </form>
              )}
            </CardContent>
            </Card>
          </div>
        </div>
      </PublicLayout>
    );
  }

  // Show reCAPTCHA overlay for login tab - only show after initial attempt and only on error
  // Never show during recovery mode (password reset flow)
  const showLoginOverlay = !isRecaptchaBypass && !isRecoveryMode && 
    activeTab === "login" && 
    loginRecaptcha.hasAttempted && 
    !loginRecaptcha.isVerified && 
    (loginRecaptcha.error || loginRecaptcha.isVerifying);

  return (
    <PublicLayout hideFooter hideHeader hideJourneyBuilder>
      {showLoginOverlay && (
        <RecaptchaOverlay
          isVerifying={loginRecaptcha.isVerifying}
          error={loginRecaptcha.error}
          onRetry={loginRecaptcha.retry}
        />
      )}
      
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center justify-center gap-3 mb-4 hover:opacity-80 transition-opacity">
              <img src={rolLogo} alt="RoomsOnline" className="h-12 w-auto" />
              <h1 className="font-display text-3xl font-light text-foreground">RoomsOnline</h1>
            </Link>
          </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in to your account or request access</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="request">Request Access</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={loading || (!isRecaptchaBypass && !loginRecaptcha.isVerified)}
                  >
                    {loading ? "Logging in..." : "Log In"}
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                </form>
              </TabsContent>
              
              <TabsContent value="request">
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact-name">Full Name</Label>
                    <Input
                      id="contact-name"
                      type="text"
                      placeholder="John Doe"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      required
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-email">Email</Label>
                    <Input
                      id="contact-email"
                      type="email"
                      placeholder="you@example.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      required
                      maxLength={255}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-message">Message</Label>
                    <Textarea
                      id="contact-message"
                      placeholder="Tell us about your property and why you'd like access..."
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      required
                      rows={4}
                      maxLength={2000}
                    />
                  </div>
                  
                  {/* Honeypot field - hidden from users */}
                  <input
                    type="text"
                    name="website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    className="absolute opacity-0 pointer-events-none"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                  />
                  
                  {/* reCAPTCHA status indicator */}
                  {requestRecaptcha.isVerified && (
                    <div className="flex items-center gap-2 p-3 bg-status-healthy/10 rounded-lg border border-status-healthy/20">
                      <ShieldCheck className="h-4 w-4 text-status-healthy" />
                      <span className="text-sm text-status-healthy">Verified</span>
                    </div>
                  )}
                  
                  <Button 
                    type="submit" 
                    className="w-full gap-2"
                    disabled={loading || requestRecaptcha.isVerifying}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : requestRecaptcha.isVerifying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Submit Request
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={handleCloseSuccessModal}>
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-status-healthy/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-status-healthy" />
            </div>
            <DialogTitle className="text-center">Request Submitted</DialogTitle>
            <DialogDescription className="text-center">
              Thank you for your interest! We've received your request and will review it shortly. 
              You'll receive an email once your access has been approved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button onClick={handleCloseSuccessModal}>
              <Home className="h-4 w-4 mr-2" />
              Back to Login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
}

// Wrapper that checks if reCAPTCHA is available
export default function Auth() {
  const { data: siteKey, isLoading } = useRecaptchaSiteKey();

  // Never let a slow flag lookup hold the sign-in screen behind a spinner:
  // after a short grace period we commit to the un-protected form and latch
  // that choice, so a late-arriving site key cannot swap the form mid-typing.
  const [graceElapsed, setGraceElapsed] = useState(false);
  const decidedRef = useRef<"recaptcha" | "plain" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setGraceElapsed(true), 1200);
    return () => clearTimeout(t);
  }, []);

  // Public guest booking hosts never show the staff sign-in screen.
  if (isGuestBookingHost()) {
    return <GuestHostLanding />;
  }

  if (!decidedRef.current) {
    if (siteKey) decidedRef.current = "recaptcha";
    else if (!isLoading || graceElapsed) decidedRef.current = "plain";
  }

  if (!decidedRef.current) {
    return (
      <PublicLayout>
        <div className="min-h-screen flex items-center justify-center px-4 py-12">
          <Card className="w-full max-w-md">
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  if (decidedRef.current === "plain") {
    return <AuthContentFallback />;
  }

  return <AuthContent />;
}


// Fallback component without reCAPTCHA (for when site key is not configured)
function AuthContentFallback() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [activeTab, setActiveTab] = useState("login");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotEmailSent, setForgotEmailSent] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [honeypot, setHoneypot] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
        toast({ title: "Set your new password", description: "Please enter a new password below" });
      } else if (event === 'SIGNED_IN' && session && !isRecoveryMode) {
        toast({ title: "Welcome back!", description: "Successfully logged in" });
        navigate("/");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !isRecoveryMode) navigate("/");
    });

    return () => subscription.unsubscribe();
  }, [navigate, toast, isRecoveryMode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Welcome back!", description: "Successfully logged in" });
      navigate("/");
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("forgot-password", { body: { email: forgotEmail.trim() } });
      if (error) throw error;
      setForgotEmailSent(true);
      toast({ title: "Email sent", description: "Check your inbox for a password reset link" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Unable to send reset email", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are the same", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Password updated", description: "Your password has been reset successfully" });
      setIsRecoveryMode(false);
      setNewPassword("");
      setConfirmPassword("");
      navigate("/");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Unable to update password", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) { setShowSuccessModal(true); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-access-request", {
        body: { name: contactName.trim(), email: contactEmail.trim(), message: contactMessage.trim(), source_page: window.location.pathname },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setContactName(""); setContactEmail(""); setContactMessage("");
      setShowSuccessModal(true);
    } catch (error: any) {
      toast({ title: "Submission failed", description: error.message || "Please try again later", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleCloseSuccessModal = () => { setShowSuccessModal(false); setActiveTab("login"); };
  const handleBackToLogin = () => { setShowForgotPassword(false); setForgotEmail(""); setForgotEmailSent(false); };

  if (isRecoveryMode) {
    return (
      <PublicLayout hideFooter hideHeader hideJourneyBuilder>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <Link to="/" className="inline-flex items-center justify-center gap-3 mb-4 hover:opacity-80 transition-opacity">
                <img src={rolLogo} alt="RoomsOnline" className="h-12 w-auto" />
                <h1 className="font-display text-3xl font-light text-foreground">RoomsOnline</h1>
              </Link>
            </div>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <KeyRound className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Set New Password</CardTitle>
                    <CardDescription>Enter your new password below</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSetNewPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input id="new-password" type="password" placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input id="confirm-password" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating...</> : "Set Password & Login"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (showForgotPassword) {
    return (
      <PublicLayout hideFooter hideHeader hideJourneyBuilder>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <Link to="/" className="inline-flex items-center justify-center gap-3 mb-4 hover:opacity-80 transition-opacity">
                <img src={rolLogo} alt="RoomsOnline" className="h-12 w-auto" />
                <h1 className="font-display text-3xl font-light text-foreground">RoomsOnline</h1>
              </Link>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Reset Password</CardTitle>
                <CardDescription>{forgotEmailSent ? "Check your email for a password reset link" : "Enter your email to receive a password reset link"}</CardDescription>
              </CardHeader>
              <CardContent>
                {forgotEmailSent ? (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center py-6">
                      <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                        <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                      </div>
                      <p className="text-center text-muted-foreground">If an account exists for <strong>{forgotEmail}</strong>, you'll receive an email with a password reset link.</p>
                    </div>
                    <Button variant="outline" className="w-full" onClick={handleBackToLogin}><ArrowLeft className="h-4 w-4 mr-2" />Back to Login</Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">Email</Label>
                      <Input id="forgot-email" type="email" placeholder="you@example.com" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>{loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : "Send Reset Link"}</Button>
                    <Button type="button" variant="ghost" className="w-full" onClick={handleBackToLogin}><ArrowLeft className="h-4 w-4 mr-2" />Back to Login</Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout hideFooter hideHeader hideJourneyBuilder>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center justify-center gap-3 mb-4 hover:opacity-80 transition-opacity">
              <img src={rolLogo} alt="RoomsOnline" className="h-12 w-auto" />
              <h1 className="font-display text-3xl font-light text-foreground">RoomsOnline</h1>
            </Link>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Welcome</CardTitle>
              <CardDescription>Sign in to your account or request access</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="request">Request Access</TabsTrigger>
                </TabsList>
                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input id="login-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>{loading ? "Logging in..." : "Log In"}</Button>
                    <div className="text-center">
                      <button type="button" onClick={() => setShowForgotPassword(true)} className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline">Forgot password?</button>
                    </div>
                  </form>
                </TabsContent>
                <TabsContent value="request">
                  <form onSubmit={handleContactSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="contact-name">Full Name</Label>
                      <Input id="contact-name" type="text" placeholder="John Doe" value={contactName} onChange={(e) => setContactName(e.target.value)} required maxLength={100} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-email">Email</Label>
                      <Input id="contact-email" type="email" placeholder="you@example.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required maxLength={255} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-message">Message</Label>
                      <Textarea id="contact-message" placeholder="Tell us about your property and why you'd like access..." value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} required rows={4} maxLength={2000} />
                    </div>
                    <input type="text" name="website" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} className="absolute opacity-0 pointer-events-none" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                    <Button type="submit" className="w-full gap-2" disabled={loading}>
                      {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting...</> : <><Send className="h-4 w-4" />Submit Request</>}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={showSuccessModal} onOpenChange={handleCloseSuccessModal}>
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-status-healthy/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-status-healthy" />
            </div>
            <DialogTitle className="text-center">Request Submitted</DialogTitle>
            <DialogDescription className="text-center">Thank you for your interest! We've received your request and will review it shortly. You'll receive an email once your access has been approved.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button onClick={handleCloseSuccessModal}><Home className="h-4 w-4 mr-2" />Back to Login</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
}