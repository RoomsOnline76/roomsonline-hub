import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useOwnerAccount, useOwnerScopes } from "@/hooks/useOwnerAccount";
import { AccountBalanceStrip } from "@/components/account/AccountBalanceStrip";
import { AccountSubscriptionCard } from "@/components/account/AccountSubscriptionCard";
import { AccountInvoicesTab } from "@/components/account/AccountInvoicesTab";
import { AccountPayoutsTab } from "@/components/account/AccountPayoutsTab";
import { AccountAnalyticsTab } from "@/components/account/AccountAnalyticsTab";
import { AccountStatementTab } from "@/components/account/AccountStatementTab";
import { AccountTwoPaymentCard } from "@/components/account/AccountTwoPaymentCard";

const startOfYear = () => `${new Date().getFullYear()}-01-01`;
const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * ROL Account — the owner's financial home: what is due, what was paid, what
 * ROL owes them, every document to download and a statement for any period.
 */
const OwnerAccount = () => {
  const [searchParams] = useSearchParams();
  const { scopes, loading: scopesLoading } = useOwnerScopes();
  const [scopeKey, setScopeKey] = useState<string>("");
  const [periodStart, setPeriodStart] = useState(startOfYear());
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  useEffect(() => {
    if (scopeKey || !scopes.length) return;
    // Deep link support: /admin/account?scope=portfolio&id=<uuid>
    const wantedScope = searchParams.get("scope");
    const wantedId = searchParams.get("id");
    const match =
      wantedScope && wantedId
        ? scopes.find((s) => s.kind === wantedScope && s.id === wantedId)
        : null;
    const target = match ?? scopes[0];
    setScopeKey(`${target.kind}:${target.id}`);
  }, [scopes, scopeKey, searchParams]);

  const scope = useMemo(
    () => scopes.find((s) => `${s.kind}:${s.id}` === scopeKey) ?? null,
    [scopes, scopeKey],
  );

  const account = useOwnerAccount(scope);

  return (
    <AppLayout>
      <PageHeader
        title="ROL Account"
        subtitle="Your billing, invoices, payouts and statements with RoomsOnline"
        className="px-4 pt-4 md:px-6"
      />


      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56">
            <label className="mb-1 block text-xs text-muted-foreground">Property or portfolio</label>
            <Select value={scopeKey} onValueChange={setScopeKey}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={scopesLoading ? "Loading…" : "Select"} />
              </SelectTrigger>
              <SelectContent>
                {scopes.map((s) => (
                  <SelectItem key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>
                    {s.kind === "portfolio" ? `${s.name} (portfolio)` : s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              className="h-9 w-40"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <Input type="date" className="h-9 w-40" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={() => void account.refresh()} disabled={account.loading}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${account.loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {scopesLoading || (account.loading && !account.config) ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !scope ? (
          <Card className="border-border/60">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No properties are linked to your account yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <AccountBalanceStrip
              balances={account.balances}
              subscriptionInvoices={account.subscriptionInvoices}
              rolInvoices={account.rolInvoices}
              config={account.config}
              unitCount={account.unitCount}
              byoGateway={account.byoGateway}
              billingPropertyId={scope.propertyIds[0] ?? null}
            />


            <AccountSubscriptionCard
              config={account.config}
              subscription={account.subscription}
              balances={account.balances}
              unitCount={account.unitCount}
              byoGateway={account.byoGateway}
              invoices={account.subscriptionInvoices}
            />

            <AccountTwoPaymentCard
              scope={scope.kind}
              entityId={scope.id}
              onChanged={() => void account.refresh()}
            />

            <HubSpotIntegrationCard />


            <Tabs defaultValue="invoices">
              <TabsList className="flex-wrap">
                <TabsTrigger value="invoices">Payments &amp; invoices</TabsTrigger>
                <TabsTrigger value="payouts">Due to you</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                <TabsTrigger value="statement">Statement</TabsTrigger>
              </TabsList>

              <TabsContent value="invoices" className="mt-4">
                <AccountInvoicesTab
                  subscriptionInvoices={account.subscriptionInvoices}
                  rolInvoices={account.rolInvoices}
                  currency={account.balances.currency}
                />
              </TabsContent>

              <TabsContent value="payouts" className="mt-4">
                <AccountPayoutsTab payouts={account.payouts} currency={account.balances.currency} />
              </TabsContent>

              <TabsContent value="analytics" className="mt-4">
                <AccountAnalyticsTab series={account.series} balances={account.balances} />
              </TabsContent>

              <TabsContent value="statement" className="mt-4">
                <AccountStatementTab
                  ledger={account.ledger}
                  balances={account.balances}
                  scopeName={scope.name}
                  periodStart={periodStart}
                  periodEnd={periodEnd}
                  vat={account.vat}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default OwnerAccount;
