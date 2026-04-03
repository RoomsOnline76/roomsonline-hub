import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";

interface PropertyBrand {
  slug: string;
  name: string;
  brand_logo_url: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  brand_font_color: string | null;
  property_id: string;
}

const STORAGE_KEY = "rol_staff_last_property";

const DEFAULT_BRAND: Omit<PropertyBrand, "property_id"> = {
  slug: "",
  name: "RoomsOnline",
  brand_logo_url: null,
  brand_primary_color: "#1a1a2e",
  brand_secondary_color: "#16213e",
  brand_font_color: "#ffffff",
};

function saveBrandToStorage(brand: PropertyBrand) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(brand));
  } catch { /* quota exceeded — non-critical */ }
}

function loadBrandFromStorage(): PropertyBrand | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function StaffLogin() {
  const { propertySlug } = useParams<{ propertySlug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [brand, setBrand] = useState<PropertyBrand | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Resolve branding: portfolio param > property param > route param > localStorage > default
  useEffect(() => {
    const portfolioSlugParam = searchParams.get("portfolio");
    const slug = searchParams.get("property") || propertySlug;

    if (portfolioSlugParam) {
      // Fetch portfolio branding
      supabase
        .from("property_portfolios" as any)
        .select("id, name, slug, metadata")
        .eq("slug", portfolioSlugParam)
        .single()
        .then(({ data }: any) => {
          if (data) {
            const meta = data.metadata || {};
            const branding = meta.branding || {};
            const fetched: PropertyBrand = {
              slug: data.slug,
              name: data.name,
              brand_logo_url: branding.logo_url || null,
              brand_primary_color: branding.primary_color || "#1a1a2e",
              brand_secondary_color: branding.secondary_color || "#16213e",
              brand_font_color: branding.font_color || "#ffffff",
              property_id: "", // portfolio login — no single property
            };
            setBrand(fetched);
            saveBrandToStorage(fetched);
          } else {
            setBrand(loadBrandFromStorage());
          }
          setLoading(false);
        });
    } else if (slug) {
      // Fetch from DB
      supabase
        .from("properties")
        .select("id, name, slug, brand_logo_url, brand_primary_color, brand_secondary_color, brand_font_color")
        .eq("slug", slug)
        .eq("is_rol_property", true)
        .single()
        .then(({ data }) => {
          if (data) {
            const fetched: PropertyBrand = {
              slug: data.slug,
              name: data.name,
              brand_logo_url: data.brand_logo_url,
              brand_primary_color: data.brand_primary_color,
              brand_secondary_color: data.brand_secondary_color,
              brand_font_color: data.brand_font_color,
              property_id: data.id,
            };
            setBrand(fetched);
            saveBrandToStorage(fetched);
          } else {
            setBrand(loadBrandFromStorage());
          }
          setLoading(false);
        });
    } else {
      setBrand(loadBrandFromStorage());
      setLoading(false);
    }
  }, [propertySlug, searchParams]);

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

      if (data.user) {
        // If we have a resolved property, persist branding and redirect
        if (brand?.property_id) {
          saveBrandToStorage(brand);
          navigate(`/pms?property=${brand.property_id}`);
        } else {
          // No property context — go to PMS root
          navigate("/pms");
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Derive CSS from brand or defaults
  const primaryColor = brand?.brand_primary_color || DEFAULT_BRAND.brand_primary_color!;
  const secondaryColor = brand?.brand_secondary_color || DEFAULT_BRAND.brand_secondary_color!;
  const fontColor = brand?.brand_font_color || DEFAULT_BRAND.brand_font_color!;
  const displayName = brand?.name || DEFAULT_BRAND.name;
  const logoUrl = brand?.brand_logo_url || DEFAULT_BRAND.brand_logo_url;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
        {/* Logo + name */}
        <div className="text-center space-y-4">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={displayName}
              className="h-16 w-auto mx-auto object-contain drop-shadow-lg"
            />
          ) : (
            <div
              className="h-16 w-16 mx-auto rounded-xl flex items-center justify-center text-2xl font-bold shadow-lg"
              style={{ backgroundColor: `${fontColor}20`, color: fontColor }}
            >
              {displayName.charAt(0)}
            </div>
          )}
          <div>
            <h1
              className="text-xl font-semibold tracking-tight"
              style={{ color: fontColor }}
            >
              {displayName}
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

        {/* Powered by */}
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
