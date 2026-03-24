import { PublicLayout } from "@/components/layout/PublicLayout";

export default function AffiliateDisclosure() {
  return (
    <PublicLayout>
      <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-20 max-w-3xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-8">
          Affiliate Disclosure
        </h1>

        <div className="prose prose-lg dark:prose-invert max-w-none space-y-6 text-muted-foreground">
          <p>
            RoomsOnline participates in the Booking.com Affiliate Programme.
            When you click on certain links on our website and make a booking on
            Booking.com, we may receive a commission at no additional cost to you.
          </p>

          <p>
            We only recommend services and accommodations that we believe will
            add value to our users. All opinions and recommendations are our own.
          </p>

          <p>
            This disclosure is in accordance with the requirements of the
            Consumer Protection Act (South Africa) and international affiliate
            marketing guidelines.
          </p>

          <p className="text-sm text-muted-foreground/70 pt-4 border-t border-border">
            Last updated: 24 March 2026
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
