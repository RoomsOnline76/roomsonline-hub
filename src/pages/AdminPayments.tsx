import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PayoutStatementRun } from "@/components/payments/PayoutStatementRun";
import { PropertyInvoiceRun } from "@/components/payments/PropertyInvoiceRun";

export default function AdminPayments() {
  return (
    <AppLayout>
      <PageHeader
        title="Payments"
        subtitle="Owner payout statements and ROL invoices to properties. Platform-wide money metrics live in ROL Pulse."
      />

      <Tabs defaultValue="payouts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payouts">Property Payouts</TabsTrigger>
          <TabsTrigger value="invoices">Property Invoices</TabsTrigger>
        </TabsList>

        {/* Property Payouts — persisted statements, default tab */}
        <TabsContent value="payouts">
          <PayoutStatementRun />
        </TabsContent>

        {/* Receivables: commission + platform fees ROL bills instead of deducting */}
        <TabsContent value="invoices">
          <PropertyInvoiceRun />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
