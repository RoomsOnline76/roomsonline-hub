

# Enable Experience Engine for Latter Days + Seed Data

## What This Does

Turn on the Experience Engine for "[SANDBOX] Latter Days - STILBAAI" (property ID: `ea9a019d-1299-46eb-b371-a0b25eb60350`) and populate it with starter policies and brand config.

## Current State

- **Property**: Villa in Stilbaai, 2 room types (3 Bedroomed Holiday House, Dungeon)
- **Experience Engine**: OFF (`amenities.experience_engine_enabled` is null)
- **rolos_policies**: 0 rows for this property
- **rolos_experience_configs**: 0 rows for this property
- **Old cancellation rules**: Exist in `amenities.cancellation_policies` (999 days/10%, 30 days/100%)

## Data Operations (via insert tool)

### 1. Enable the toggle

```sql
UPDATE properties
SET amenities = jsonb_set(
  amenities,
  '{experience_engine_enabled}',
  'true'
)
WHERE id = 'ea9a019d-1299-46eb-b371-a0b25eb60350';
```

### 2. Seed cancellation policy (migrating existing rules)

```sql
INSERT INTO rolos_policies (property_id, policy_type, rule)
VALUES ('ea9a019d-1299-46eb-b371-a0b25eb60350', 'cancellation', '{
  "mode": "standard",
  "days_before": 30,
  "forfeit_percent": 100,
  "non_refundable": false,
  "date_ranges": [
    {"start": "2026-12-15", "end": "2027-01-15", "days_before": 60, "forfeit_percent": 100}
  ],
  "dynamic_factors": [],
  "ai_prompt_override": null
}');
```

This preserves the existing 30-day/100% rule and adds a peak season override for Dec–Jan (Stilbaai's peak).

### 3. Seed brand kit config

```sql
INSERT INTO rolos_experience_configs (property_id, config_type, config)
VALUES ('ea9a019d-1299-46eb-b371-a0b25eb60350', 'brand_kit', '{
  "heading_font": null,
  "body_font": null,
  "brand_voice": "Warm, coastal, family-friendly. Latter Days is a relaxed Stilbaai holiday home.",
  "ai_email_tone": "friendly and informative"
}');
```

### 4. Set accommodation label to "House"

Since this is a holiday house/villa:

```sql
UPDATE properties
SET amenities = jsonb_set(
  amenities,
  '{accommodation_label}',
  '"villa"'
)
WHERE id = 'ea9a019d-1299-46eb-b371-a0b25eb60350';
```

## Summary

| Item | Value |
|------|-------|
| Experience Engine | ON |
| Cancellation Policy | 30 days / 100% forfeit, peak Dec–Jan override |
| Brand Kit | Seeded with warm coastal voice |
| Accommodation Label | Villa |

No code changes needed — purely data operations.

