
# Onboarding Management Dashboard Enhancement

## Problem Summary
The Admin Onboarding page currently only shows properties that have existing onboarding tokens (1 property). However, 30+ properties exist in the system at various lifecycle stages. Admins cannot see or manage properties that:
- Never received an onboarding token
- Are already completed/activated
- Need a new/re-issued token

## Solution Overview

Transform the dashboard from a **token-centric** view to a **property-centric** view that shows all properties with their onboarding status, with smart filtering to focus on active work.

### New Property Lifecycle View

| Status | Description | Default Visibility |
|--------|-------------|-------------------|
| **Not Started** | No token ever issued | ✅ Shown |
| **In Progress** | Active token, wizard not completed | ✅ Shown |
| **Token Expired** | Expired token, not completed | ✅ Shown |
| **Completed** | Token used, wizard finished | ❌ Hidden by default |
| **Live/Activated** | Property is `show_on_website=true` | ❌ Hidden by default |

---

## Technical Implementation

### File: `src/pages/AdminOnboarding.tsx`

**1. Change Data Structure**
Shift from token-first to property-first approach:

```typescript
interface PropertyOnboardingRow {
  id: string;
  name: string;
  owner_email: string | null;
  listing_status: string;
  show_on_website: boolean;
  activated_at: string | null;
  onboarding_score: number;
  // Token data (optional)
  token?: {
    id: string;
    token: string;
    expires_at: string;
    used_at: string | null;
    created_at: string;
  };
}
```

**2. Revised Data Loading**
Query properties as the primary source, then left-join token data:

```typescript
const loadData = async () => {
  // Load all properties (non-deleted)
  const { data: propData } = await supabase
    .from("properties")
    .select("id, name, owner_email, listing_status, show_on_website, activated_at, amenities")
    .is("permanently_deleted_at", null)
    .order("created_at", { ascending: false });

  // Load all tokens (to map to properties)
  const { data: tokenData } = await supabase
    .from("property_onboarding_tokens")
    .select("*")
    .order("created_at", { ascending: false });

  // Build property-centric view
  const tokensByProperty = new Map(tokenData?.map(t => [t.property_id, t]));
  
  const enrichedProperties = propData?.map(prop => ({
    ...prop,
    onboarding_score: prop.amenities?.onboarding_score || 0,
    token: tokensByProperty.get(prop.id) || null,
  }));
  
  setPropertyRows(enrichedProperties);
};
```

**3. New Status Derivation**
Calculate comprehensive onboarding status per property:

```typescript
type OnboardingStatus = 
  | "not_started"    // No token ever issued
  | "in_progress"    // Active token, not used
  | "token_expired"  // Expired token, not used
  | "completed"      // Token used
  | "live";          // show_on_website = true

const getOnboardingStatus = (row: PropertyOnboardingRow): OnboardingStatus => {
  if (row.show_on_website) return "live";
  if (!row.token) return "not_started";
  if (row.token.used_at) return "completed";
  if (new Date(row.token.expires_at) < new Date()) return "token_expired";
  return "in_progress";
};
```

**4. Add "Show Completed" Toggle**
Add a switch to show/hide completed and live properties:

```typescript
const [showCompleted, setShowCompleted] = useState(false);

// In filter section:
<div className="flex items-center gap-2">
  <Switch 
    checked={showCompleted} 
    onCheckedChange={setShowCompleted} 
  />
  <Label className="text-sm text-muted-foreground">
    Show Completed & Live
  </Label>
</div>
```

**5. Updated Filter Logic**

```typescript
const filteredProperties = useMemo(() => {
  let result = propertyRows;

  // Hide completed/live unless toggle is on
  if (!showCompleted) {
    result = result.filter(r => {
      const status = getOnboardingStatus(r);
      return status !== "completed" && status !== "live";
    });
  }

  // Status filter
  if (statusFilter !== "all") {
    result = result.filter(r => getOnboardingStatus(r) === statusFilter);
  }

  // Search filter (cross-column)
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    result = result.filter(r =>
      r.name.toLowerCase().includes(query) ||
      r.owner_email?.toLowerCase().includes(query) ||
      getOnboardingStatus(r).includes(query)
    );
  }

  return result;
}, [propertyRows, showCompleted, statusFilter, searchQuery]);
```

**6. Updated Stats Cards**
Show property-centric metrics:

```typescript
const stats = useMemo(() => ({
  total: propertyRows.length,
  notStarted: propertyRows.filter(r => getOnboardingStatus(r) === "not_started").length,
  inProgress: propertyRows.filter(r => getOnboardingStatus(r) === "in_progress").length,
  completed: propertyRows.filter(r => getOnboardingStatus(r) === "completed").length,
  live: propertyRows.filter(r => getOnboardingStatus(r) === "live").length,
}), [propertyRows]);

// Cards: Total | Not Started | In Progress | Completed | Live
```

**7. Updated Status Filter Buttons**
Replace token-based filters with property-centric filters:

```typescript
const statusFilters = [
  { key: "all", label: "All" },
  { key: "not_started", label: "Not Started" },
  { key: "in_progress", label: "In Progress" },
  { key: "token_expired", label: "Expired" },
  { key: "completed", label: "Completed" },
  { key: "live", label: "Live" },
];
```

**8. Updated Table Columns**

| Column | Content |
|--------|---------|
| Property | Name (link to property) |
| Owner | Email address |
| Status | Not Started / In Progress / Expired / Completed / Live |
| Progress | Score bar from amenities.onboarding_score |
| Token Sent | Date or "Never" |
| Expires | Date or "—" |
| Actions | Issue/Resend, Copy Link, Extend, View Property |

**9. Dynamic Actions per Status**
Dropdown menu adapts based on property status:

```typescript
// For "Not Started" properties
<DropdownMenuItem onClick={() => handleSendOnboarding(row.id, row.owner_email)}>
  <Send className="h-4 w-4 mr-2" />
  Issue Onboarding Token
</DropdownMenuItem>

// For "In Progress" or "Expired" properties
<DropdownMenuItem onClick={() => handleResendOnboarding(row)}>
  <RefreshCw className="h-4 w-4 mr-2" />
  Re-issue Token
</DropdownMenuItem>

// For "Completed" or "Live" properties (re-issue capability)
<DropdownMenuItem onClick={() => handleResendOnboarding(row)}>
  <RefreshCw className="h-4 w-4 mr-2" />
  Re-issue Token
</DropdownMenuItem>
```

**10. Status Badge Component Update**

```typescript
const StatusBadge = ({ status }: { status: OnboardingStatus }) => {
  switch (status) {
    case "not_started":
      return <Badge variant="outline" className="gap-1"><Circle className="h-3 w-3" />Not Started</Badge>;
    case "in_progress":
      return <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600"><Clock className="h-3 w-3" />In Progress</Badge>;
    case "token_expired":
      return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Expired</Badge>;
    case "completed":
      return <Badge variant="default" className="gap-1"><Check className="h-3 w-3" />Completed</Badge>;
    case "live":
      return <Badge className="gap-1 bg-emerald-500"><Globe className="h-3 w-3" />Live</Badge>;
  }
};
```

---

## Summary of Changes

1. **Property-centric view** - Shows all 30+ properties, not just the 1 with a token
2. **Smart defaults** - Completed and Live properties hidden by default to focus admin attention
3. **Toggle for visibility** - "Show Completed & Live" switch reveals hidden properties
4. **Re-issue capability** - Any property can receive a new/fresh onboarding token
5. **Better status clarity** - 5 distinct statuses vs. previous 3 token-only statuses
6. **Cross-column search** - Works on property name, email, and status

