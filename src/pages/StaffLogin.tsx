import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";

interface PropertyBrand {
  id: string;
  name: string;
  slug: string;
  brand_logo_url: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  brand_font_color: string | null;
}

export default function StaffLogin() {
  const { propertySlug } = useParams<{ propertySlug: string }>();
  const navigate = useNavigate();
  const [property, setProperty] = useState<PropertyBrand | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!propertySlug) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const fetchProperty = async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, slug, brand_logo_url, brand_primary_color, brand_secondary_color, brand_font_color")
        .eq("slug", propertySlug)
        .eq("is_rol_property", true)
        .single();

      if (error || !data) {
        setNotFound(true);
      } else {
        setProperty(data as PropertyBrand);
      }
      setLoading(false);
    };

    fetchProperty();
  }, [propertySlug]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        toast.error(error.message);
        setSubmitting(false);
        return;
      }

      if (data.user && property) {
        // Redirect to PMS for this property
        navigate(`/pms?property=${property.id}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Derive CSS from brand colors
  const primaryColor = property?.brand_primary_color || "#1a1a2e";
  const secondaryColor = property?.brand_secondary_color || "#16213e";
  const fontColor = property?.brand_font_color || "#ffffff";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold text-foreground">Property Not Found</h1>
          <p className="text-muted-foreground">This staff login link is invalid or the property no longer exists.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative"
      style={{
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
      }}
    >
      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `radial-gradient(circle at 25px 25px, ${fontColor} 1px, transparent 0)`,
          backgroundSize: "50px 50px",
        }}
      />

      <div className="relative z-10 w-full max-w-sm space-y-8">
        {/* Property logo + name */}
        <div className="text-center space-y-4">
          {property?.brand_logo_url ? (
            <img
              src={property.brand_logo_url}
              alt={property.name}
              className="h-16 w-auto mx-auto object-contain drop-shadow-lg"
            />
          ) : (
            <div
              className="h-16 w-16 mx-auto rounded-xl flex items-center justify-center text-2xl font-bold shadow-lg"
              style={{ backgroundColor: `${fontColor}20`, color: fontColor }}
            >
              {property?.name?.charAt(0) || "?"}
            </div>
          )}
          <div>
            <h1
              className="text-xl font-semibold tracking-tight"
              style={{ color: fontColor }}
            >
              {property?.name}
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: `${fontColor}99` }}
            >
              Staff Portal
            </p>
          </div>
        </div>

        {/* Login card */}
        <Card className="border-0 shadow-2xl backdrop-blur-sm bg-white/95 dark:bg-zinc-900/95">
          <CardContent className="pt-6 pb-6 px-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="staff-email" className="text-foreground text-sm">
                  Email
                </Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-password" className="text-foreground text-sm">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="staff-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-11 font-medium text-sm"
                disabled={submitting}
                style={{
                  backgroundColor: primaryColor,
                  color: fontColor,
                }}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Powered by — subtle */}
        <p
          className="text-center text-[10px] tracking-wide"
          style={{ color: `${fontColor}40` }}
        >
          Powered by{" "}
          <span className="font-medium" style={{ color: `${fontColor}55` }}>
            RoomsOnline
          </span>{" "}
          — Rooms Done Right
        </p>
      </div>
    </div>
  );
}
