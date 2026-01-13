import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LedgerSummary } from "./LedgerSummary";
import { BatchList } from "./BatchList";
import { Wallet, FileSpreadsheet, Activity } from "lucide-react";

/**
 * Bank Export Dashboard - Main container for the Financials > Bank Exports sub-tab
 * Features real-time ledger summary, batch management, and export functionality
 */
export function BankExportDashboard() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="batches" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Batches
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2">
            <Wallet className="h-4 w-4" />
            Ledger
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <LedgerSummary />
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Recent Batches</h3>
            <BatchList />
          </div>
        </TabsContent>

        <TabsContent value="batches" className="mt-4">
          <BatchList />
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
          <LedgerSummary />
        </TabsContent>
      </Tabs>
    </div>
  );
}
