import { Navbar } from "@/components/Navbar";
import { SearchForm } from "@/components/SearchForm";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Zap, Globe, HeadphonesIcon } from "lucide-react";
import heroImage from "@/assets/hero-hotel.jpg";

const Home = () => {
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
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
        </div>
        
        <div className="relative z-10 container mx-auto px-4 py-20 md:py-32">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-4">
              Book Your Perfect Stay
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Search and book from thousands of vacation rentals, hotels, and B&Bs worldwide
            </p>
          </div>
          
          <SearchForm />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-foreground mb-4">
              Why Choose RoomsOnline
            </h3>
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
                  <h4 className="font-semibold text-lg mb-2 text-foreground">
                    {feature.title}
                  </h4>
                  <p className="text-muted-foreground">
                    {feature.description}
                  </p>
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
              { number: "10K+", label: "Properties" },
              { number: "50K+", label: "Happy Guests" },
              { number: "100+", label: "Destinations" },
              { number: "24/7", label: "Support" },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">
                  {stat.number}
                </div>
                <div className="text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
