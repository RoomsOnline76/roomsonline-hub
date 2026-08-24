import { motion } from "framer-motion";
import { CreditCard, Info, TrendingDown, Wallet } from "lucide-react";
import {
  formatScheduleMoney,
  formatVolumeBand,
  usePublicGatewaySchedule,
} from "@/hooks/usePublicGatewaySchedule";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

/**
 * Public payment-processing schedule.
 *
 * Numbers come from the active `gateway_billing_configs` row through
 * `usePublicGatewaySchedule` — the same record the invoice run charges on and
 * the contract quotes — so the public page cannot drift from the agreement.
 * When the schedule cannot be read the section degrades to prose instead of
 * showing a stale figure.
 */
export function GatewayScheduleSection() {
  const { tiers, monthlyFee, bestPercentage, isBanded, currency, schedule, isLoading } =
    usePublicGatewaySchedule();

  return (
    <section className="py-10 sm:py-12 lg:py-16 border-t" id="payment-processing">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary mb-3">
            <CreditCard className="h-3 w-3" /> Only when you take payments through our gateway
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold">Payment processing</h2>
          <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
            This is separate from the platform and booking fee. It applies to card payments
            processed on the RoomsOnline payment gateway — and it is payable from day one,
            including during your free 60 days, because the acquirer charges us on every
            transaction.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={fadeUp}
          transition={{ duration: 0.6 }}
          className="rounded-2xl border bg-card p-6 sm:p-8"
        >
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading the current schedule…</p>
          ) : !schedule ? (
            <p className="text-sm text-muted-foreground">
              Card processing on our gateway is charged on the schedule set out in your agreement.
              Ask us for the current schedule and we will show you the exact rate before you sign.
            </p>
          ) : (
            <>
              {isBanded ? (
                <>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Rate by monthly card volume
                  </h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2.5 pr-4 font-semibold">Monthly card volume</th>
                          <th className="py-2.5 px-4 font-semibold text-center">Rate</th>
                          <th className="py-2.5 pl-4 font-semibold text-center">Per transaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tiers.map((tier) => (
                          <tr key={tier.min_monthly_volume} className="border-b last:border-0">
                            <td className="py-2.5 pr-4">{formatVolumeBand(tier, currency)}</td>
                            <td className="py-2.5 px-4 text-center font-medium text-primary">
                              {tier.percentage}%
                            </td>
                            <td className="py-2.5 pl-4 text-center text-muted-foreground">
                              {tier.fixed_fee ? formatScheduleMoney(tier.fixed_fee, currency) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="flex items-start gap-2 rounded-lg border bg-background p-3 text-xs leading-relaxed">
                      <TrendingDown className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>
                        Your band is set by the card volume you process in the trailing month and
                        moves automatically — grow your volume and the rate comes down
                        {bestPercentage != null ? ` to as low as ${bestPercentage}%` : ""}. There is
                        nothing to apply for.
                      </span>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border bg-background p-3 text-xs leading-relaxed">
                      <Wallet className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>
                        {monthlyFee > 0 ? (
                          <>
                            A monthly platform fee of{" "}
                            <strong>{formatScheduleMoney(monthlyFee, currency)}</strong> applies
                            alongside the transaction rate above.
                          </>
                        ) : (
                          <>
                            No monthly fee for the gateway — you are charged on transactions only,
                            so a quiet month costs you nothing.
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm">
                  Card payments on our gateway are charged at{" "}
                  <strong className="text-primary">{schedule.base_percentage ?? "—"}%</strong>
                  {schedule.fixed_fee_per_txn
                    ? ` plus ${formatScheduleMoney(schedule.fixed_fee_per_txn, currency)} per transaction`
                    : ""}
                  {monthlyFee > 0
                    ? `, with a monthly platform fee of ${formatScheduleMoney(monthlyFee, currency)}`
                    : ", with no monthly fee"}
                  .
                </p>
              )}

              <div className="mt-5 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3.5">
                <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">
                  <span className="font-semibold">How it works.</span> When you use the RoomsOnline
                  payment gateway, fees are calculated using the schedule above. The rate that
                  appears in your signed contract is the rate that will be applied — this page and
                  your agreement read from the same schedule
                  {schedule.version != null ? ` (currently version ${schedule.version})` : ""}.
                  Volume and portfolio terms remain negotiable and any agreed rate is written into
                  your contract.
                </p>
              </div>
            </>
          )}

          {/* Own merchant account versus ours */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-background p-4">
              <h4 className="text-sm font-semibold">Use the RoomsOnline gateway</h4>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                Nothing to apply for and no acquirer negotiation — payments, refunds, folios and
                payout statements are wired up on day one, charged on the schedule above.
              </p>
            </div>
            <div className="rounded-xl border bg-background p-4">
              <h4 className="text-sm font-semibold">Bring your own merchant account</h4>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                Keep your own gateway credentials and your processing fees stay with your own
                provider at whatever rate you have negotiated. The schedule above does not apply;
                the bring-your-own gateway integration is an add-on from day 61. If you never take
                payment online, reservation-only mode costs nothing to run.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
