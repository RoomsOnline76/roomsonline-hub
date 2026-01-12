-- Insert help articles for Onboarding Wizard and Contract Signing features

-- Admin Article 1: Sending & Managing Onboarding Links
INSERT INTO public.help_articles (slug, title, section, role_target, impact_level, content_markdown, is_published, sort_order)
VALUES (
  'admin-onboarding-links',
  'Sending & Managing Onboarding Links',
  'getting_started',
  ARRAY['admin', 'dev'],
  'info',
  '## What This Does

The Property Onboarding Wizard allows property owners to complete their property profile through a secure, mobile-friendly experience. Admins can send unique onboarding links that give owners direct access to update their property information.

## Sending an Onboarding Link

1. Navigate to **Property Overview**
2. Find the property and click the **Send Onboarding** button (envelope icon)
3. Enter the owner''s email address
4. Click **Send Onboarding Email**

The owner receives an email with a secure link to complete their property profile.

:::info
Onboarding links expire after **30 days**. If the link expires before the owner completes onboarding, you can send a new one.
:::

## Monitoring Progress

### From Property Overview
- Properties with incomplete profiles show a progress indicator
- The **SCORE** column shows completion level (Platinum, Gold, Silver)

### From Property Form
- Open the property and go to the **Onboarding** tab
- View the full wizard experience as the owner sees it
- See which sections are complete and which need attention

## Understanding the Wizard Steps

The onboarding wizard has **11 steps**:

| Step | Content |
|------|---------|
| Property Identity | Name, type, basic info |
| Description | Property description and editorial content |
| Location | Address and coordinates |
| Facilities | Amenities and features |
| Offerings | What''s included in the stay |
| Media | Photos and videos |
| Policies | Check-in, cancellation, house rules |
| Rooms Overview | Room types and configurations |
| Contact Details | Owner contact information |
| Banking | Payment details |
| Review & Submit | Final review and submission |

## Auto-Save Feature

Changes are automatically saved as the owner progresses through the wizard. They can leave and return at any time without losing progress.

## Related Articles
- Understanding Onboarding Scores
- Property Contract Management',
  true,
  10
);

-- Admin Article 2: Property Contract Management
INSERT INTO public.help_articles (slug, title, section, role_target, impact_level, content_markdown, is_published, sort_order)
VALUES (
  'admin-contract-management',
  'Property Contract Management',
  'roles_permissions',
  ARRAY['admin', 'dev'],
  'warning',
  '## What This Does

Contracts formalize the partnership between RoomsOnline and property owners. Properties cannot go live on the website without a signed contract or admin override.

## Contract Lifecycle

| Status | Icon | Meaning |
|--------|------|---------|
| None | ✗ Red | No contract created yet |
| Sent | ✉️ Blue | Contract emailed to owner |
| Viewed | 👁 Gray | Owner opened the signing link |
| Signed | ✓ Green | Owner completed signature |
| Overridden | ⚠️ Orange | Admin bypassed requirement |

## Sending a Contract

1. Go to **Property Overview**
2. Click **Edit** on the property
3. In the **General** tab, find the **Contract Status** card
4. Click **Send Contract**
5. Enter the owner''s email address
6. Click **Send**

The owner receives an email with a secure signing link.

:::warning
The signing link expires after **30 days**. Use the **Resend** button if the owner hasn''t signed within this period.
:::

## Checking Contract Status

In Property Overview, the **CONTRACT** column shows the current status:
- Hover over the icon for more details
- Click to open the property and manage the contract

## Contract Versioning

Each time you send a new contract, a new version is created:
- Previous versions are retained for audit purposes
- Only the latest version is shown to owners
- Version history is visible in the Contract Status card

## What Happens After Signing

When an owner signs:
1. Their signature is captured and stored securely
2. A confirmation email is sent to the owner
3. The property can now be set to "Show on Website"
4. The signed contract PDF is available for download

## Related Articles
- Contract Overrides & Compliance
- Signing Your Property Contract (Owner Guide)',
  true,
  20
);

-- Admin Article 3: Contract Overrides & Compliance
INSERT INTO public.help_articles (slug, title, section, role_target, impact_level, content_markdown, is_published, sort_order)
VALUES (
  'admin-contract-overrides',
  'Contract Overrides & Compliance',
  'roles_permissions',
  ARRAY['admin', 'dev'],
  'critical',
  '## What This Does

In exceptional circumstances, admins can override the contract requirement to allow a property to go live without a signed contract. This should be used sparingly and with proper justification.

:::critical
**Contract overrides create compliance risk.** Every override is permanently logged in the audit trail. Use only when absolutely necessary.
:::

## When to Use Overrides

Valid reasons for override:
- Verbal agreement pending formal signature
- Existing relationship with documented history
- Technical issues preventing signature
- Urgent business need with management approval

## How to Override

1. Open the property in **Edit** mode
2. Go to the **General** tab
3. Find the **Contract Status** card
4. Click **Override Contract Requirement**
5. Enter a detailed reason (minimum 20 characters)
6. Confirm the override

:::warning
The override reason is **mandatory** and must explain why the contract requirement is being bypassed. This becomes part of the permanent audit record.
:::

## Audit Trail

All contract overrides are logged with:
- Admin who performed the override
- Date and time
- Reason provided
- IP address and user agent

This information is visible in:
- The Contract Status card
- The Admin Audit Log

## Reverting an Override

To require a signed contract after an override:
1. Send a new contract to the owner
2. Once signed, the override status is superseded

## Compliance Considerations

Properties with overrides should be reviewed regularly:
- Check the Override reason is still valid
- Follow up with owners to get proper signatures
- Consider revoking website visibility if compliance is at risk

## Related Articles
- Property Contract Management
- Admin Audit Log',
  true,
  25
);

-- Admin Article 4: Understanding Onboarding Scores
INSERT INTO public.help_articles (slug, title, section, role_target, impact_level, content_markdown, is_published, sort_order)
VALUES (
  'admin-onboarding-scores',
  'Understanding Onboarding Scores',
  'data_authority',
  ARRAY['admin', 'dev'],
  'info',
  '## What This Does

Onboarding scores indicate how complete a property profile is. Higher scores mean better search visibility, more bookings, and a richer guest experience.

## Score Bands

| Band | Score | Badge |
|------|-------|-------|
| Platinum | 90%+ | ⭐ Gold star |
| Gold | 70-89% | 🥇 Gold medal |
| Silver | 50-69% | 🥈 Silver medal |
| In Progress | <50% | 🔄 Progress indicator |

## Weighted Scoring System

Not all fields are equal. The scoring system weights sections by their impact on bookings:

| Section | Weight | Why It Matters |
|---------|--------|----------------|
| Media (Photos) | 25% | Visual appeal drives bookings |
| Description | 20% | Helps guests understand the property |
| Facilities | 15% | Guests filter by amenities |
| Location | 15% | Essential for search and maps |
| Contact Details | 10% | Required for communication |
| Policies | 10% | Reduces booking friction |
| Banking | 5% | Needed for payments |

## Encouraging Completion

When following up with owners:
- Highlight which sections are incomplete
- Explain the booking impact of missing information
- Offer to help with photo uploads or descriptions
- Send a new onboarding link if theirs has expired

## Viewing Scores

### Property Overview
The **SCORE** column shows the current band for each property.

### Property Form
The **Onboarding** tab shows a detailed breakdown of completion by section.

## Impact on Website Visibility

While score doesn''t directly affect visibility, properties with higher scores:
- Have more compelling listings
- Rank better in search results
- Convert more browsers to bookers
- Receive fewer guest questions

## Related Articles
- Sending & Managing Onboarding Links
- Completing Your Property Profile (Owner Guide)',
  true,
  30
);

-- Owner Article 1: Completing Your Property Profile
INSERT INTO public.help_articles (slug, title, section, role_target, impact_level, content_markdown, is_published, sort_order)
VALUES (
  'owner-onboarding-wizard',
  'Completing Your Property Profile',
  'owner_getting_started',
  ARRAY['user'],
  'info',
  '## What This Does

The Property Onboarding Wizard helps you create a complete, compelling profile for your property. A well-completed profile leads to more bookings and happier guests.

## Getting Started

You''ll receive an email from RoomsOnline with a link to complete your property profile. Click the link to access the wizard.

:::info
The link expires after **30 days**. If your link has expired, contact your RoomsOnline representative to receive a new one.
:::

## The 11 Steps

| Step | What You''ll Provide |
|------|---------------------|
| 1. Property Identity | Basic information about your property |
| 2. Description | What makes your property special |
| 3. Location | Your address and map location |
| 4. Facilities | Amenities like WiFi, parking, pool |
| 5. Offerings | What''s included in the stay |
| 6. Media | Photos of your property |
| 7. Policies | Check-in times, cancellation rules |
| 8. Rooms Overview | Your room types and configurations |
| 9. Contact Details | How guests can reach you |
| 10. Banking | Payment information |
| 11. Review & Submit | Final check before going live |

## Auto-Save

Your progress is **saved automatically** as you complete each section. You can:
- Leave at any time and return later
- Use any device (mobile, tablet, desktop)
- Pick up exactly where you left off

## Completion Score

As you complete sections, your score increases:
- **Platinum** (90%+): Exceptional profile
- **Gold** (70-89%): Strong profile
- **Silver** (50-69%): Good start
- **In Progress** (<50%): Keep going!

Higher scores mean better visibility and more bookings.

## Tips for Success

1. **Photos matter most** - Add at least 10 high-quality photos
2. **Be descriptive** - Help guests imagine staying at your property
3. **Be accurate** - Set correct expectations to avoid bad reviews
4. **Update regularly** - Keep your profile current

## Need Help?

If you get stuck or have questions, contact your RoomsOnline representative or email us at dev@roomsonline.co.za.

## Related Articles
- Uploading Property Images
- Signing Your Property Contract',
  true,
  5
);

-- Owner Article 2: Signing Your Property Contract
INSERT INTO public.help_articles (slug, title, section, role_target, impact_level, content_markdown, is_published, sort_order)
VALUES (
  'owner-contract-signing',
  'Signing Your Property Contract',
  'owner_getting_started',
  ARRAY['user'],
  'warning',
  '## Why You Need to Sign

Before your property can appear on RoomsOnline, we need your agreement to our partnership terms. This protects both you and your guests, and ensures a professional relationship.

## How to Sign

1. Check your email for a message from **RoomsOnline**
2. Click the **Sign Contract** button in the email
3. Review the contract document (you can download the PDF)
4. Enter your **full name**
5. Enter your **email address**
6. Enter your **designation/title** (e.g., "Owner", "Manager")
7. Draw your signature using your mouse or finger
8. Check the agreement box
9. Click **Sign Contract**

:::info
Your signature is legally binding and secure. A copy of the signed contract will be emailed to you immediately after signing.
:::

## Signing on Mobile

The signing page works on all devices. On mobile:
- Turn your phone sideways for more signature space
- Use your finger to draw your signature
- Tap "Clear" if you need to try again

## Alternative: Upload a Signature

If you prefer, you can upload an image of your signature instead of drawing it:
1. Click the **Upload** tab in the signature section
2. Select an image file of your signature
3. The image will be placed in the signature area

## What Happens Next

Once you sign:
1. You receive a confirmation email with the signed contract attached
2. Your property can be activated on the RoomsOnline website
3. You gain access to your owner dashboard
4. Guests can start booking your property

## Link Expired?

Signing links expire after 30 days. If your link has expired:
- Contact your RoomsOnline representative
- They will send you a new signing link
- Your previous contract details are preserved

## Questions About the Contract?

If you have questions about the contract terms before signing, please contact us at dev@roomsonline.co.za. We''re happy to explain any section.

## Related Articles
- Completing Your Property Profile
- Getting Started as a Property Owner',
  true,
  10
);

-- Owner Article 3: Uploading Property Images
INSERT INTO public.help_articles (slug, title, section, role_target, impact_level, content_markdown, is_published, sort_order)
VALUES (
  'owner-uploading-images',
  'Uploading Property Images',
  'property_appearance',
  ARRAY['user'],
  'info',
  '## Why Photos Matter

Photos are the **#1 factor** in booking decisions. Properties with high-quality images receive up to 40% more bookings than those with poor photos.

## Image Requirements

| Requirement | Recommendation |
|-------------|----------------|
| Minimum | 5 photos |
| Recommended | 15-20 photos |
| Format | JPG, PNG, or WebP |
| Size | At least 1200px wide |
| Quality | High resolution, well-lit |

## What to Photograph

### Must-Have Shots
- Exterior/entrance
- Living areas
- Each bedroom
- Bathrooms
- Kitchen/dining
- Outdoor spaces

### Nice-to-Have Shots
- Views from the property
- Unique features
- Nearby attractions
- Seasonal highlights

## Uploading in the Wizard

1. Go to the **Media** step in the onboarding wizard
2. Click **Upload Images** or drag and drop files
3. Wait for uploads to complete
4. Arrange photos in your preferred order
5. Select your **hero image** (the main photo shown first)

:::info
The first image (hero image) is the most important. Choose a photo that shows your property at its best and creates immediate appeal.
:::

## Photo Tips

### Lighting
- Shoot during daylight hours
- Open curtains and turn on lights
- Avoid harsh shadows

### Composition
- Shoot from corners to show more of the room
- Keep the camera level
- Remove clutter before shooting

### Preparation
- Make beds and arrange pillows
- Clear countertops
- Add simple touches like fresh flowers

## After Uploading

You can:
- Reorder photos by dragging
- Delete photos you don''t want
- Replace photos with better versions
- Change your hero image at any time

## Professional Photography

Consider hiring a professional photographer if:
- Your property is premium/luxury
- You want to maximize bookings
- Your current photos aren''t getting results

Many owners see the investment pay for itself within a few bookings.

## Related Articles
- Completing Your Property Profile
- Making Your Property Stand Out',
  true,
  15
);