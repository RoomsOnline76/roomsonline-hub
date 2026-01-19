import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: "What is the best PMS for hotels in South Africa?",
    answer: "Benson offers the most complete integration for South African hotels, supporting the full booking lifecycle including modifications and cancellations. NightsBridge is ideal for properties wanting simpler widget-based bookings with minimal technical setup. Cloudbeds is excellent for boutique hotels with international guests."
  },
  {
    question: "How does RoomsOnline handle PMS switching?",
    answer: "Seamlessly via the external_system configuration. Update your property's PMS setting, and RoomsOnline automatically routes all requests through the appropriate adapter with zero downtime. Your booking interface, URLs, and guest experience remain unchanged."
  },
  {
    question: "Is live availability always checked before booking?",
    answer: "Yes – our invariant architectural rule is NO_BOOKING_FROM_CACHE. Every booking request verifies availability with the PMS API before confirmation, preventing overbookings and race conditions. This adds milliseconds of latency but prevents costly double-bookings."
  },
  {
    question: "Can I use multiple PMS systems across different properties?",
    answer: "Yes, RoomsOnline supports per-property PMS configuration. Each property in your portfolio can use a different PMS (Benson for one hotel, Cloudbeds for another) while maintaining a unified booking experience and consolidated reporting."
  },
  {
    question: "What happens if my PMS is not yet integrated?",
    answer: "You can use RoomsOnline Native, our built-in inventory system, while we work on your PMS integration. Alternatively, contact us about prioritizing your PMS – our adapter pattern makes adding new integrations straightforward."
  },
  {
    question: "How is RoomsOnline different from an OTA?",
    answer: "Unlike OTAs, RoomsOnline doesn't own your inventory or take commission on bookings. We're a booking orchestration layer that keeps your PMS as the source of truth. You maintain direct guest relationships and full editorial control."
  },
  {
    question: "What data does RoomsOnline sync from my PMS?",
    answer: "Depending on your PMS capabilities, we sync availability calendars, room types, rate plans, property descriptions, images, amenities, and booking data. All synced data is clearly marked with its PMS source, and you can override any field in RoomsOnline."
  },
  {
    question: "Is there a cost per booking?",
    answer: "RoomsOnline does not charge commission on bookings. We operate on a subscription model, ensuring your booking costs are predictable regardless of volume."
  }
];

// JSON-LD Schema for FAQ
export const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": faqData.map(item => ({
    "@type": "Question",
    "name": item.question,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": item.answer
    }
  }))
};

export function PMSComparisonFAQ() {
  return (
    <div className="space-y-4">
      <Accordion type="single" collapsible className="w-full space-y-2">
        {faqData.map((item, index) => (
          <AccordionItem 
            key={index} 
            value={`faq-${index}`}
            className="border border-border rounded-lg px-4"
          >
            <AccordionTrigger className="hover:no-underline text-left">
              <div className="flex items-start gap-3">
                <HelpCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="font-medium">{item.question}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-4 pl-8">
              <p className="text-muted-foreground leading-relaxed">{item.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
