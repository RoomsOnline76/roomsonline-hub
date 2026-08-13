import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, subMonths, differenceInDays, parseISO } from "date-fns";
import { TrendingUp, TrendingDown, ChevronDown, Sparkles, Network, UserMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { getPMSSystemByKey } from "@/lib/pmsSystemsConfig";

// Colors for pie charts - using HSL values that work in both light/dark modes
const PIE_COLORS = [
  'hsl(142, 71%, 45%)', // green
  'hsl(217, 91%, 60%)', // blue  
  'hsl(38, 92%, 50%)',  // amber
  'hsl(0, 84%, 60%)',   // red
  'hsl(258, 90%, 66%)', // purple
  'hsl(330, 81%, 60%)', // pink
  'hsl(186, 94%, 41%)', // cyan
  'hsl(84, 81%, 44%)',  // lime
];

export function PropertyAcquisitionTracker() {
  const [pmsExpanded, setPmsExpanded] = useState(false);

  // Fetch active properties with PMS data for distribution tracking
  const { data: properties = [] } = useQuery({
    queryKey: ["pms-tracker-properties"],
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name, owner_email, owner_name, property_type, bedrooms, max_guests, external_system, created_at, is_active, is_trading, is_sandbox")
        .eq("is_active", true);
      return data || [];
    },
  });

  // Fetch inactive properties for attrition tracking
  const { data: inactiveProperties = [] } = useQuery({
    queryKey: ["pms-tracker-inactive-properties"],
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name, external_system, created_at, updated_at, is_active")
        .eq("is_active", false);
      return data || [];
    },
  });

  // PMS Distribution and Property Growth Stats
  const pmsStats = useMemo(() => {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));
    const twoMonthsAgoStart = startOfMonth(subMonths(now, 2));
    const twoMonthsAgoEnd = endOfMonth(subMonths(now, 2));
    
    // Group by PMS system (active properties only)
    const pmsGroups: Record<string, { count: number; thisMonth: number; lastMonth: number; twoMonthsAgo: number; lost: number }> = {};
    
    properties.forEach(p => {
      const pmsKey = p.external_system || 'none';
      if (!pmsGroups[pmsKey]) {
        pmsGroups[pmsKey] = { count: 0, thisMonth: 0, lastMonth: 0, twoMonthsAgo: 0, lost: 0 };
      }
      pmsGroups[pmsKey].count++;
      
      if (p.created_at) {
        const createdDate = parseISO(p.created_at);
        if (createdDate >= thisMonthStart) {
          pmsGroups[pmsKey].thisMonth++;
        } else if (createdDate >= lastMonthStart && createdDate <= lastMonthEnd) {
          pmsGroups[pmsKey].lastMonth++;
        } else if (createdDate >= twoMonthsAgoStart && createdDate <= twoMonthsAgoEnd) {
          pmsGroups[pmsKey].twoMonthsAgo++;
        }
      }
    });
    
    // Track attrition by PMS (inactive properties)
    inactiveProperties.forEach(p => {
      const pmsKey = p.external_system || 'none';
      if (!pmsGroups[pmsKey]) {
        pmsGroups[pmsKey] = { count: 0, thisMonth: 0, lastMonth: 0, twoMonthsAgo: 0, lost: 0 };
      }
      pmsGroups[pmsKey].lost++;
    });
    
    // Property acquisition metrics (active only)
    const thisMonthAdded = properties.filter(p => p.created_at && parseISO(p.created_at) >= thisMonthStart).length;
    const lastMonthAdded = properties.filter(p => {
      if (!p.created_at) return false;
      const d = parseISO(p.created_at);
      return d >= lastMonthStart && d <= lastMonthEnd;
    }).length;
    const twoMonthsAgoAdded = properties.filter(p => {
      if (!p.created_at) return false;
      const d = parseISO(p.created_at);
      return d >= twoMonthsAgoStart && d <= twoMonthsAgoEnd;
    }).length;
    
    // Attrition metrics (inactive properties)
    const totalInactive = inactiveProperties.length;
    const lostThisMonth = inactiveProperties.filter(p => {
      if (!p.updated_at) return false;
      const d = parseISO(p.updated_at);
      return d >= thisMonthStart;
    }).length;
    const lostLastMonth = inactiveProperties.filter(p => {
      if (!p.updated_at) return false;
      const d = parseISO(p.updated_at);
      return d >= lastMonthStart && d <= lastMonthEnd;
    }).length;
    
    const totalProperties = properties.length;
    // Pipeline view is the one place stale inventory stays visible, so we surface
    // trading vs stale side by side instead of hiding the non-trading rows.
    const tradingProperties = properties.filter((p: any) => p.is_trading === true).length;
    const staleProperties = properties.filter((p: any) => p.is_trading !== true).length;
    const connectedToPMS = properties.filter(p => p.external_system && p.external_system !== 'none').length;
    const momGrowth = lastMonthAdded > 0 ? ((thisMonthAdded - lastMonthAdded) / lastMonthAdded) * 100 : (thisMonthAdded > 0 ? 100 : 0);
    
    // Churn rate = Lost this month / Total active properties at start of month
    const totalAtStartOfMonth = totalProperties - thisMonthAdded + lostThisMonth;
    const churnRate = totalAtStartOfMonth > 0 ? (lostThisMonth / totalAtStartOfMonth) * 100 : 0;
    
    // Net growth = Added - Lost
    const netGrowthThisMonth = thisMonthAdded - lostThisMonth;
    const netGrowthLastMonth = lastMonthAdded - lostLastMonth;
    
    // Calculate months since first property
    const firstProperty = properties.reduce((earliest, p) => {
      if (!p.created_at) return earliest;
      const d = parseISO(p.created_at);
      return !earliest || d < earliest ? d : earliest;
    }, null as Date | null);
    
    const monthsSinceFirst = firstProperty 
      ? Math.max(1, Math.ceil(differenceInDays(now, firstProperty) / 30))
      : 1;
    const avgPerMonth = totalProperties / monthsSinceFirst;
    
    // PMS breakdown with display names
    const pmsBreakdown = Object.entries(pmsGroups)
      .map(([key, data]) => {
        const systemConfig = getPMSSystemByKey(key);
        const displayName = systemConfig?.name || (key === 'none' ? 'No PMS' : key.charAt(0).toUpperCase() + key.slice(1));
        const percentage = totalProperties > 0 ? (data.count / totalProperties) * 100 : 0;
        const momChange = data.lastMonth > 0 
          ? ((data.thisMonth - data.lastMonth) / data.lastMonth) * 100 
          : (data.thisMonth > 0 ? Infinity : 0);
        
        return {
          key,
          name: displayName,
          count: data.count,
          thisMonth: data.thisMonth,
          lastMonth: data.lastMonth,
          lost: data.lost,
          percentage,
          momChange,
          isNew: data.lastMonth === 0 && data.thisMonth > 0,
        };
      })
      .sort((a, b) => b.count - a.count);
    
    return {
      thisMonthAdded,
      lastMonthAdded,
      twoMonthsAgoAdded,
      momGrowth,
      totalProperties,
      tradingProperties,
      staleProperties,
      connectedToPMS,
      connectionRate: totalProperties > 0 ? (connectedToPMS / totalProperties) * 100 : 0,
      avgPerMonth,
      pmsBreakdown,
      // Attrition metrics
      totalInactive,
      lostThisMonth,
      lostLastMonth,
      churnRate,
      netGrowthThisMonth,
      netGrowthLastMonth,
    };
  }, [properties, inactiveProperties]);

  if (!pmsStats || pmsStats.totalProperties === 0) {
    return null;
  }

  return (
    <Collapsible open={pmsExpanded} onOpenChange={setPmsExpanded}>
      <Card className="p-2">
        <CollapsibleTrigger className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Property Acquisition & PMS Distribution</span>
            <span className="text-xs text-muted-foreground">
              {pmsStats.tradingProperties} trading · {pmsStats.staleProperties} stale · {pmsStats.totalProperties} total · {pmsStats.connectedToPMS} connected ({pmsStats.connectionRate.toFixed(0)}%)
            </span>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", pmsExpanded && "rotate-180")} />
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          {/* Property Acquisition KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mt-3 pt-3 border-t">
            <div className="p-2 rounded bg-secondary/30">
              <div className="text-[10px] font-medium text-muted-foreground mb-1">This Month</div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-primary">{pmsStats.thisMonthAdded}</span>
                {pmsStats.thisMonthAdded > 0 && <Sparkles className="h-3 w-3 text-amber-500" />}
              </div>
              <span className="text-[9px] text-muted-foreground">properties added</span>
            </div>
            
            <div className="p-2 rounded bg-secondary/30">
              <div className="text-[10px] font-medium text-muted-foreground mb-1">Last Month</div>
              <span className="text-xl font-bold">{pmsStats.lastMonthAdded}</span>
              <span className="text-[9px] text-muted-foreground block">vs {pmsStats.twoMonthsAgoAdded} prior</span>
            </div>
            
            <div className="p-2 rounded bg-secondary/30">
              <div className="text-[10px] font-medium text-muted-foreground mb-1">MoM Growth</div>
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  "text-xl font-bold",
                  pmsStats.momGrowth > 0 ? "text-green-600 dark:text-green-400" : 
                  pmsStats.momGrowth < 0 ? "text-red-600 dark:text-red-400" : ""
                )}>
                  {pmsStats.momGrowth > 0 ? "+" : ""}{pmsStats.momGrowth === Infinity ? "∞" : `${pmsStats.momGrowth.toFixed(0)}%`}
                </span>
                {pmsStats.momGrowth > 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400" />
                ) : pmsStats.momGrowth < 0 ? (
                  <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />
                ) : null}
              </div>
              <span className="text-[9px] text-muted-foreground">vs last month</span>
            </div>
            
            {/* Attrition Card */}
            <div className="p-2 rounded bg-secondary/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-muted-foreground">Attrition</span>
                <UserMinus className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  "text-xl font-bold",
                  pmsStats.lostThisMonth > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                )}>
                  {pmsStats.lostThisMonth > 0 ? "-" : ""}{pmsStats.lostThisMonth}
                </span>
                {pmsStats.lostThisMonth > 0 && <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />}
              </div>
              <span className="text-[9px] text-muted-foreground">{pmsStats.totalInactive} total inactive</span>
            </div>
            
            {/* Net Growth Card */}
            <div className="p-2 rounded bg-secondary/30">
              <div className="text-[10px] font-medium text-muted-foreground mb-1">Net Growth</div>
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  "text-xl font-bold",
                  pmsStats.netGrowthThisMonth > 0 ? "text-green-600 dark:text-green-400" : 
                  pmsStats.netGrowthThisMonth < 0 ? "text-red-600 dark:text-red-400" : ""
                )}>
                  {pmsStats.netGrowthThisMonth > 0 ? "+" : ""}{pmsStats.netGrowthThisMonth}
                </span>
                {pmsStats.netGrowthThisMonth > 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400" />
                ) : pmsStats.netGrowthThisMonth < 0 ? (
                  <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />
                ) : null}
              </div>
              <span className="text-[9px] text-muted-foreground">added - lost</span>
            </div>
            
            <div className="p-2 rounded bg-secondary/30">
              <div className="text-[10px] font-medium text-muted-foreground mb-1">PMS Connected</div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold">{pmsStats.connectedToPMS}</span>
                <span className="text-sm text-muted-foreground">/ {pmsStats.totalProperties}</span>
              </div>
              <span className={cn(
                "text-[9px] font-medium px-1 rounded",
                pmsStats.connectionRate >= 80 ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" :
                pmsStats.connectionRate >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" :
                "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
              )}>
                {pmsStats.connectionRate.toFixed(0)}% coverage
              </span>
            </div>
            
            <div className="p-2 rounded bg-secondary/30">
              <div className="text-[10px] font-medium text-muted-foreground mb-1">Avg/Month</div>
              <span className="text-xl font-bold">{pmsStats.avgPerMonth.toFixed(1)}</span>
              <span className="text-[9px] text-muted-foreground block">acquisition rate</span>
            </div>
            
            
            {/* Mini PMS Pie */}
            <div className="p-2 rounded bg-secondary/30 flex items-center justify-center">
              <ResponsiveContainer width={60} height={60}>
                <PieChart>
                  <Pie
                    data={pmsStats.pmsBreakdown}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={15}
                    outerRadius={25}
                    paddingAngle={2}
                  >
                    {pmsStats.pmsBreakdown.map((entry, index) => (
                      <Cell key={entry.key} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string) => [`${value} (${((value / pmsStats.totalProperties) * 100).toFixed(0)}%)`, name]}
                    contentStyle={{ fontSize: '10px', padding: '4px 8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-[9px] text-muted-foreground ml-1">
                {pmsStats.pmsBreakdown.length} systems
              </div>
            </div>
          </div>
          
          {/* PMS System Breakdown Cards */}
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs font-medium text-muted-foreground mb-2">PMS System Breakdown</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {pmsStats.pmsBreakdown.map((pms, idx) => (
                <div 
                  key={pms.key} 
                  className="p-2 rounded border bg-card hover:bg-secondary/20 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate">{pms.name}</span>
                    <div 
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                    />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold">{pms.count}</span>
                    <span className="text-[10px] text-muted-foreground">{pms.percentage.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {pms.isNew ? (
                      <span className="text-[9px] font-medium px-1 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400 flex items-center gap-0.5">
                        <Sparkles className="h-2 w-2" /> new
                      </span>
                    ) : pms.momChange !== 0 && pms.momChange !== Infinity ? (
                      <span className={cn(
                        "text-[9px] font-medium px-1 rounded flex items-center gap-0.5",
                        pms.momChange > 0 ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" :
                        "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                      )}>
                        {pms.momChange > 0 ? <TrendingUp className="h-2 w-2" /> : <TrendingDown className="h-2 w-2" />}
                        {pms.momChange > 0 ? "+" : ""}{pms.momChange.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-[9px] text-muted-foreground">—</span>
                    )}
                    {pms.thisMonth > 0 && (
                      <span className="text-[9px] text-muted-foreground">+{pms.thisMonth} this mo</span>
                    )}
                    {pms.lost > 0 && (
                      <span className="text-[9px] text-red-600 dark:text-red-400">-{pms.lost} lost</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
