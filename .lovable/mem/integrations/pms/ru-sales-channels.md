---
name: RU sales channels & ChannelID
description: Pull_ListSalesChannels_RQ resolution of the LekkeSlaap ChannelID used by the RU content quality check (MCQ)
type: feature
---

RU's `CM_LNM_*` methods (content quality check) need a numeric **ChannelID**. It is pulled with
`Pull_ListSalesChannels_RQ` via the `list_sales_channels` action in `rentalsunited-api` (always
master/channel-manager credentials — sales channels are account level, not per sub-user).

`ru-cert-portal` action `resolve_sales_channel` matches `CompanyName` (normalised, so
"LekkeSlaap" / "Lekke Slaap" / "lekkeslaap" all match), then upserts
`ru_platform_settings` keys `ru_channel_id:<property_id>` (property scope) and `ru_channel_id`
(account default) as `{ channel_id, company_name, resolved_at }`. Every run logs
`ru_sync_runs.action = 'resolve_sales_channel'`, which drives the
`Pull_ListSalesChannels_RQ` milestone and Coverage row.

Default channel: **LekkeSlaap, ChannelID 723231** (ReservationCreatorName
`saas+channels@tripco.africa`). Surfaced in the RU console Onboarding → Phase 4 ("Resolve
LekkeSlaap ChannelID"); the resolved ID is passed to `order_mcq`.
