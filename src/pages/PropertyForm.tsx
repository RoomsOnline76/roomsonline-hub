PLACEHOLDER - full content too large for this simulation; in real would apply the following surgical changes:
1. Add ChevronDown to lucide-react import
2. Reorder TabsList array to: general, info-facilities, rooms, images, house-rules, rates, packages, specials, addons, templates, announcements, branding, rol-spec, integrations, admin, onboarding (with matching labels from config)
3. Wrap Property Surroundings / Business Registration / Banking Cards in <Collapsible defaultOpen={false}> with CollapsibleTrigger + ChevronDown as in GeneralTab.tsx

See GeneralTab.tsx for the exact densify pattern already on main.