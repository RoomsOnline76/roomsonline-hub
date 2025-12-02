import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { SearchForm } from "@/components/SearchForm";
import { PropertiesMap } from "@/components/PropertiesMap";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Zap, Globe, HeadphonesIcon } from "lucide-react";
import heroImage from "@/assets/hero-hotel.jpg";

// Keys match database property_type values (lowercase)
const PROPERTY_TYPES = [
  { key: "hotel", label: "Hotel", color: "bg-red-500", hex: "#ef4444" },
  { key: "guest_house", label: "Guest House", color: "bg-blue-500", hex: "#3b82f6" },
  { key: "bnb", label: "B&B", color: "bg-yellow-500", hex: "#eab308" },
  { key: "lodge", label: "Lodge", color: "bg-green-500", hex: "#22c55e" },
  { key: "resort", label: "Resort", color: "bg-purple-500", hex: "#a855f7" },
  { key: "villa", label: "Villa", color: "bg-orange-500", hex: "#f97316" },
  { key: "apartment", label: "Apartment", color: "bg-teal-500", hex: "#14b8a6" },
];

// Create color map for the map component
const TYPE_COLORS: Record<string, string> = PROPERTY_TYPES.reduce(
  (acc, t) => ({ ...acc, [t.key]: t.hex }), {}
);

const Home = () => {
  const [enabledTypes, setEnabledTypes] = useState<Record<string, boolean>>(
    () => PROPERTY_TYPES.reduce((acc, t) => ({ ...acc, [t.key]: true }), {})
  );

  const toggleType = (key: string) => {
    setEnabledTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const features = [
    {
      icon: Shield,
      title: "Secure Booking",
      description: "Industry-standard security for all your reservations",
    },
    {
      icon: Zap,
      title: "Instant Confirmation",
      description: "Get immediate booking confirmations from multiple systems",
    },
    {
      icon: Globe,
      title: "Multi-Platform",
      description: "Connect to NightsBridge, Checkfront, and more",
    },
    {
      icon: HeadphonesIcon,
      title: "24/7 Support",
      description: "Round-the-clock assistance for your bookings",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="relative">
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
        </div>

        <div className="relative z-10 container mx-auto px-4 py-20 md:py-32">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-4">Book Your Perfect Stay</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Search and book from our curated destinations portfolio
            </p>
          </div>

          <SearchForm />
        </div>
      </section>

      {/* Properties Map Section */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-foreground mb-2">Explore Our Properties</h3>
            <p className="text-muted-foreground">Click on a pin to view property details</p>
          </div>
          
          {/* Property Type Toggles */}
          <div className="flex flex-wrap justify-center gap-4 mb-6">
            {PROPERTY_TYPES.map((type) => (
              <button
                key={type.key}
                onClick={() => toggleType(type.key)}
                className="flex items-center gap-2 cursor-pointer select-none group"
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                    enabledTypes[type.key]
                      ? `${type.color} border-transparent`
                      : "bg-transparent border-muted-foreground/50"
                  }`}
                >
                  {enabledTypes[type.key] && (
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </span>
                <span className={`text-sm font-medium transition-colors ${
                  enabledTypes[type.key] ? "text-foreground" : "text-muted-foreground"
                }`}>
                  {type.label}
                </span>
              </button>
            ))}
          </div>

          <PropertiesMap enabledTypes={enabledTypes} typeColors={TYPE_COLORS} />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-foreground mb-4">Why Choose RoomsOnline</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our unified booking engine connects you with properties from multiple management systems
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="border-border hover:shadow-[var(--shadow-medium)] transition-shadow">
                <CardContent className="pt-6">
                  <div className="h-12 w-12 rounded-lg bg-[var(--hero-gradient)] flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <h4 className="font-semibold text-lg mb-2 text-foreground">{feature.title}</h4>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { number: "36+", label: "Properties" },
              { number: "50K+", label: "Happy Guests" },
              { number: "100+", label: "Destinations" },
              { number: "24/7", label: "Support" },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">{stat.number}</div>
                <div className="text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} RoomsOnline. All rights reserved.
            </p>
            <div className="flex gap-6">
              <a href="/privacy-policy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Privacy Policy
              </a>
              <a href="/terms-of-service" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
