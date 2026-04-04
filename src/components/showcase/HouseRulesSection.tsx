import { motion } from "framer-motion";
import { Clock, Users, PawPrint, Cigarette, Baby, ShieldCheck, Info } from "lucide-react";

interface HouseRulesSectionProps {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  maxGuests?: number | null;
  houseRules?: {
    pets_allowed?: boolean;
    smoking_allowed?: boolean;
    children_allowed?: boolean;
    parties_allowed?: boolean;
    quiet_hours?: string;
    [key: string]: any;
  } | null;
  cancellationPolicy?: string | null;
  thingsToKnow?: string | null;
}

export function HouseRulesSection({
  checkInTime,
  checkOutTime,
  maxGuests,
  houseRules,
  cancellationPolicy,
  thingsToKnow,
}: HouseRulesSectionProps) {
  const hasCheckTimes = checkInTime || checkOutTime;
  const hasRules = houseRules && Object.keys(houseRules).length > 0;
  
  if (!hasCheckTimes && !hasRules && !cancellationPolicy && !thingsToKnow && !maxGuests) return null;

  const ruleItems: { icon: React.ReactNode; label: string; value: string }[] = [];

  if (checkInTime) ruleItems.push({ icon: <Clock className="h-3.5 w-3.5" />, label: "Check-in", value: checkInTime });
  if (checkOutTime) ruleItems.push({ icon: <Clock className="h-3.5 w-3.5" />, label: "Check-out", value: checkOutTime });
  if (maxGuests) ruleItems.push({ icon: <Users className="h-3.5 w-3.5" />, label: "Max guests", value: String(maxGuests) });

  if (houseRules) {
    if (houseRules.pets_allowed !== undefined) {
      ruleItems.push({ icon: <PawPrint className="h-3.5 w-3.5" />, label: "Pets", value: houseRules.pets_allowed ? "Allowed" : "Not allowed" });
    }
    if (houseRules.smoking_allowed !== undefined) {
      ruleItems.push({ icon: <Cigarette className="h-3.5 w-3.5" />, label: "Smoking", value: houseRules.smoking_allowed ? "Allowed" : "Not allowed" });
    }
    if (houseRules.children_allowed !== undefined) {
      ruleItems.push({ icon: <Baby className="h-3.5 w-3.5" />, label: "Children", value: houseRules.children_allowed ? "Welcome" : "Not suitable" });
    }
    if (houseRules.parties_allowed !== undefined) {
      ruleItems.push({ icon: <Users className="h-3.5 w-3.5" />, label: "Events", value: houseRules.parties_allowed ? "Allowed" : "Not allowed" });
    }
    if (houseRules.quiet_hours) {
      ruleItems.push({ icon: <Info className="h-3.5 w-3.5" />, label: "Quiet hours", value: houseRules.quiet_hours });
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6 }}
      className="py-8 sm:py-10 border-t border-border/40"
    >
      <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight mb-5">
        Things to know
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* House Rules */}
        {ruleItems.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-primary" />
              House rules
            </h3>
            <div className="space-y-2">
              {ruleItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="text-muted-foreground/70">{item.icon}</span>
                  <span className="font-medium text-foreground">{item.label}:</span>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cancellation Policy */}
        {cancellationPolicy && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Cancellation policy</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{cancellationPolicy}</p>
          </div>
        )}

        {/* Things to Know */}
        {thingsToKnow && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Good to know</h3>
            <div className="space-y-2">
              {thingsToKnow.split(/\n/).filter(l => l.trim()).map((line, i) => (
                <p key={i} className="text-sm text-muted-foreground leading-relaxed">{line.trim()}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}
