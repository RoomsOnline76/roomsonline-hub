
# PMS Control Dashboard - Fix Sync Status Display

## Problem Summary
The PMS Control page shows incorrect sync statuses because:
1. The "Play" button triggers a dummy function that doesn't actually sync or update the database
2. The `pms_credentials.last_sync_at` field is never updated by the actual sync operations
3. NightsBridge is a widget-based integration but displays like a traditional API sync

## Solution

### 1. Fix the "Trigger Sync" Button
Make the Play button actually call the appropriate PMS edge function and update `last_sync_at` after success.

**Changes to `src/pages/DevPMS.tsx`:**
- Replace the dummy `triggerSync` function with one that:
  - Calls the correct edge function based on `system_type` (e.g., `benson-api` with `action: 'health_check'`)
  - Updates `pms_credentials.last_sync_at` on success
  - Refreshes the local state

### 2. NightsBridge Special Handling
For NightsBridge (widget-only), the dashboard should:
- Show "Online" status instead of sync-based statuses
- Display "Last Activity" from `nightsbridge_booking_sessions.created_at` (most recent session)
- Hide the "Play" sync button since there's nothing to trigger

**Changes:**
- Add a separate query to fetch latest NightsBridge session
- Create `getNightsBridgeStatus()` helper function
- Conditionally render different UI for widget-based systems

### 3. UI Improvements

| System Type | Status Display | Last Sync Column | Actions |
|-------------|---------------|------------------|---------|
| API-based (Benson, Hostfully, etc.) | Synced/Stale/Never Synced | Timestamp from `last_sync_at` | Play, Power toggle |
| Widget (NightsBridge) | Online/Active | "Last Activity: X ago" from sessions | Power toggle only |

## Technical Implementation

### File: `src/pages/DevPMS.tsx`

**Add state for NightsBridge activity:**
```typescript
const [nightsBridgeLastActivity, setNightsBridgeLastActivity] = useState<string | null>(null);
```

**Update `loadData()` to fetch NightsBridge sessions:**
```typescript
const [credentialsResult, trackerResult, nbSessionResult] = await Promise.all([
  // ... existing queries
  supabase
    .from('nightsbridge_booking_sessions')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle(),
]);

setNightsBridgeLastActivity(nbSessionResult.data?.created_at || null);
```

**Fix `triggerSync()` to actually sync:**
```typescript
const triggerSync = async (adapter: PMSAdapter) => {
  toast.info(`Triggering sync for ${adapter.property_name || adapter.system_type}...`);
  
  try {
    // Call the appropriate edge function
    const { data, error } = await supabase.functions.invoke(`${adapter.system_type}-api`, {
      body: { action: 'health_check', credential_id: adapter.id }
    });
    
    if (error) throw error;
    
    // Update last_sync_at on success
    await supabase
      .from('pms_credentials')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', adapter.id);
    
    // Refresh data
    await loadData();
    toast.success('Sync completed successfully');
  } catch (err) {
    console.error('Sync failed:', err);
    toast.error('Sync failed');
  }
};
```

**Add NightsBridge-specific rendering:**
```typescript
// For NightsBridge connections, show different UI
const isWidgetBased = config.isWidgetOnly;

// In the table rendering:
{isWidgetBased ? (
  <Badge className="bg-emerald-500/10 text-emerald-600">Online</Badge>
) : (
  getConnectionSyncBadge(adapter.is_active, adapter.last_sync_at)
)}

// Last activity column for NightsBridge
{isWidgetBased ? (
  nightsBridgeLastActivity 
    ? `Active ${formatDistanceToNow(new Date(nightsBridgeLastActivity))} ago`
    : 'No sessions'
) : (
  adapter.last_sync_at ? format(...) : 'Never'
)}
```

**Hide Play button for widget-based systems:**
```typescript
{!isWidgetBased && (
  <Button variant="ghost" size="sm" onClick={() => triggerSync(adapter)}>
    <Play className="h-4 w-4" />
  </Button>
)}
```

## Summary
- API systems get working sync triggers that update timestamps
- NightsBridge shows real activity from booking sessions
- The dashboard accurately reflects the email health report status
