import { useEffect } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Hammer, Mail } from "lucide-react";

const UnderConstruction = () => {
  useEffect(() => {
    document.title = "Under Construction — Sleep in Africa";
    const meta = document.querySelector('meta[name="description"]');
    const content =
      "Our booking experience is being polished. We'll be back online shortly.";
    if (meta) meta.setAttribute("content", content);
    else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = content;
      document.head.appendChild(m);
    }
  }, []);

  return (
    <PublicLayout hideJourneyBuilder hideFooter>
      <section className="relative flex flex-1 items-center justify-center overflow-hidden py-20">
        {/* Soft brand gradient backdrop */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(1200px 600px at 20% 10%, hsl(var(--primary) / 0.08), transparent 60%), radial-gradient(900px 500px at 80% 90%, hsl(var(--accent) / 0.10), transparent 60%)",
          }}
        />

        <div className="mx-auto w-full max-w-2xl px-6 text-center">
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-border bg-card shadow-luxury">
            <Hammer className="h-9 w-9 text-primary" strokeWidth={1.5} />
          </div>

          <p className="runway-section mb-6">Sleep in Africa · Reservations</p>

          <h1 className="runway-title mb-6 text-foreground">
            We're polishing the experience
          </h1>

          <p className="runway-prose mx-auto mb-10 max-w-xl">
            Our online booking is temporarily offline while we make a few
            refinements. Please check back soon — or reach out and we'll happily
            assist with your reservation directly.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="btn-thumb-zone min-w-[200px]">
              <a href="mailto:reservations@sleepinafrica.com">
                <Mail className="mr-2 h-4 w-4" />
                Contact reservations
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="btn-thumb-zone min-w-[200px]"
            >
              <a href="https://connect.roomsonline.co.za/">
                Visit main site
              </a>
            </Button>
          </div>

          <p className="mt-12 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Thank you for your patience
          </p>
        </div>
      </section>
    </PublicLayout>
  );
};

export default UnderConstruction;
