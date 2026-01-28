

# Enhanced Brochure with Local Experiences - Implementation Plan

## Current State

The `generate-itinerary-pdf` edge function currently generates a brochure with:
- Header/branding
- Guest information
- Itinerary (property cards with dates, room, price)
- Summary totals
- Footer

**Missing:** The `local_experiences` table data (nature, culture, adventure, dining) is never fetched or displayed.

---

## Proposed Enhancement

### New Brochure Sections

For each property stay, add:

| Section | Content | Source |
|---------|---------|--------|
| **Top Experiences** | 4-5 curated activities | `local_experiences` table |
| **Where to Dine** | Featured restaurant recommendation | `local_experiences` where category='dining' |
| **Practical Info** | Check-in time, directions, contact | `properties` table |
| **Share Section** | QR code + social sharing links | Generated |

### Visual Layout

```text
┌─────────────────────────────────────────────┐
│  [ROL Logo]                                 │
│  Your Journey - 5 nights, 2 destinations    │
├─────────────────────────────────────────────┤
│  GUEST INFORMATION                          │
│  Name: John Smith | Email: john@...         │
├─────────────────────────────────────────────┤
│  ╔═══════════════════════════════════════╗  │
│  ║ STAY 1: Bushman's Kloof              ║  │
│  ║ Cederberg | 3 nights | Feb 10-13     ║  │
│  ║─────────────────────────────────────║  │
│  ║ [Property Image]                     ║  │
│  ║                                       ║  │
│  ║ TOP 5 EXPERIENCES NEARBY             ║  │
│  ║ 🌿 Cederberg Rock Art Trail          ║  │
│  ║ 🎨 San Cave Paintings Tour           ║  │
│  ║ 🏃 Stadsaal Caves Hike               ║  │
│  ║ 🧘 Wellness Center & Spa             ║  │
│  ║                                       ║  │
│  ║ 🍷 WHERE TO DINE                     ║  │
│  ║ Pierneef à La Motte                  ║  │
│  ║ Cape Winelands farm-to-table         ║  │
│  ║ "Book the terrace for sunset views"  ║  │
│  ║ Dress: Smart casual | Reserve: Yes   ║  │
│  ║                                       ║  │
│  ║ 📍 GETTING THERE                     ║  │
│  ║ 3h drive from Cape Town via N7       ║  │
│  ║ Check-in: 14:00 | Check-out: 11:00   ║  │
│  ╚═══════════════════════════════════════╝  │
│                                             │
│  ╔═══════════════════════════════════════╗  │
│  ║ STAY 2: Cape Grace Hotel             ║  │
│  ║ Cape Town | 2 nights | Feb 13-15     ║  │
│  ║ [Similar structure with experiences] ║  │
│  ╚═══════════════════════════════════════╝  │
├─────────────────────────────────────────────┤
│  TRIP SUMMARY                               │
│  5 nights | 2 properties | ZAR 45,000       │
├─────────────────────────────────────────────┤
│  SHARE YOUR ADVENTURE                       │
│  [QR Code] Scan to share with friends       │
│  WhatsApp | Email | Copy Link               │
└─────────────────────────────────────────────┘
```

---

## Technical Implementation

### 1. Update `generate-itinerary-pdf/index.ts`

**Changes:**

1. **Fetch local experiences for each property:**
```typescript
// For each property in the itinerary
const { data: experiences } = await supabase
  .from("local_experiences")
  .select("*")
  .eq("property_id", stay.propertyId)
  .eq("is_active", true)
  .order("display_order")
  .limit(6);
```

2. **Separate dining from other experiences:**
```typescript
const diningExperience = experiences?.find(e => e.category === 'dining');
const otherExperiences = experiences?.filter(e => e.category !== 'dining').slice(0, 4);
```

3. **Generate experience cards HTML:**
```typescript
function generateExperienceHTML(experience: LocalExperience): string {
  const icons = {
    nature: '🌿',
    culture: '🎨',
    adventure: '🏃',
    relaxation: '🧘',
    wellness: '💆',
    food: '🍴'
  };
  
  return `
    <div class="experience-item">
      <span class="experience-icon">${icons[experience.category]}</span>
      <div class="experience-content">
        <span class="experience-title">${experience.title}</span>
        ${experience.duration_hours ? `<span class="experience-duration">${experience.duration_hours}h</span>` : ''}
      </div>
    </div>
  `;
}
```

4. **Generate dining section HTML:**
```typescript
function generateDiningHTML(dining: DiningExperience): string {
  return `
    <div class="dining-section">
      <h4>🍷 Where to Dine</h4>
      <div class="dining-card">
        <h5 class="dining-name">${dining.title}</h5>
        <p class="dining-cuisine">${dining.cuisine_type || dining.description}</p>
        <p class="dining-tip">"${dining.why_locals_love_it}"</p>
        <div class="dining-meta">
          ${dining.dress_code ? `<span>Dress: ${dining.dress_code}</span>` : ''}
          ${dining.reservation_required ? '<span>Reservations recommended</span>' : ''}
          <span class="price-badge">${dining.price_indicator}</span>
        </div>
      </div>
    </div>
  `;
}
```

5. **Add practical info section:**
```typescript
function generatePracticalHTML(property: Property): string {
  return `
    <div class="practical-section">
      <h4>📍 Getting There</h4>
      <div class="practical-info">
        ${property.address ? `<p>${property.address}</p>` : ''}
        ${property.check_in_time ? `<p>Check-in: ${property.check_in_time}</p>` : ''}
        ${property.check_out_time ? `<p>Check-out: ${property.check_out_time}</p>` : ''}
        ${property.contact_phone ? `<p>Contact: ${property.contact_phone}</p>` : ''}
      </div>
    </div>
  `;
}
```

6. **Add sharing section with QR code:**
```typescript
function generateShareHTML(itinerary: Itinerary): string {
  const shareUrl = `https://book.sleepinafrica.roomsonline.co.za/journey/confirmation/${itinerary.id}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(shareUrl)}`;
  
  return `
    <div class="share-section">
      <h2>Share Your Adventure</h2>
      <div class="share-content">
        <img src="${qrCodeUrl}" alt="QR Code" class="qr-code" />
        <p>Scan to view online and share with friends!</p>
        <p class="share-url">${shareUrl}</p>
      </div>
    </div>
  `;
}
```

### 2. CSS Additions

```css
/* Experiences Grid */
.experiences-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #eee;
}

.experiences-section h4 {
  font-size: 11pt;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
}

.experience-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.experience-icon {
  font-size: 16pt;
}

.experience-title {
  font-weight: 500;
}

.experience-duration {
  color: #666;
  font-size: 9pt;
  margin-left: auto;
}

/* Dining Section */
.dining-section {
  background: linear-gradient(135deg, #fdf2f8 0%, #fff 100%);
  border-radius: 8px;
  padding: 16px;
  margin-top: 16px;
}

.dining-name {
  font-family: 'Playfair Display', serif;
  font-size: 14pt;
  margin-bottom: 4px;
}

.dining-cuisine {
  color: #666;
  font-size: 10pt;
  margin-bottom: 8px;
}

.dining-tip {
  font-style: italic;
  color: #e91e8c;
  font-size: 10pt;
  margin-bottom: 8px;
}

.dining-meta {
  display: flex;
  gap: 12px;
  font-size: 9pt;
  color: #666;
}

.price-badge {
  background: #333;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: capitalize;
}

/* QR Code Section */
.share-section {
  text-align: center;
  margin-top: 40px;
  padding: 24px;
  background: #f8f9fa;
  border-radius: 8px;
}

.qr-code {
  width: 120px;
  height: 120px;
  margin: 16px auto;
}

.share-url {
  font-family: monospace;
  font-size: 9pt;
  color: #666;
  word-break: break-all;
}
```

### 3. Auto-Enrich Missing Experiences

If a property has no local experiences, automatically call `enrich-property-experiences`:

```typescript
// Check if property needs enrichment
if (!experiences || experiences.length < 3) {
  console.log(`Auto-enriching experiences for property ${stay.propertyId}`);
  
  // Call enrich function (non-blocking - don't wait)
  supabase.functions.invoke('enrich-property-experiences', {
    body: { property_id: stay.propertyId }
  }).catch(err => console.error('Enrichment failed:', err));
  
  // For this brochure, show placeholder
  // Next brochure generation will have real data
}
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/generate-itinerary-pdf/index.ts` | Modify | Add experiences, dining, practical, share sections |

---

## Implementation Steps

1. **Update the edge function** to fetch `local_experiences` for each property
2. **Add HTML generators** for experiences, dining, practical info, and sharing sections
3. **Add CSS styling** for the new sections
4. **Add auto-enrichment trigger** for properties without experiences
5. **Test with sample itinerary** to verify all sections render correctly

---

## Expected Outcome

**Before:**
- Basic booking confirmation PDF
- Property name, dates, price only
- No destination guidance

**After:**
- Comprehensive destination guide
- Top 5 curated experiences per property
- Featured dining recommendation matched to property tier
- Practical check-in/directions info
- QR code for easy sharing
- Auto-enrichment for properties without curated content

The brochure becomes a **travel companion** that guests can use throughout their trip, not just a booking receipt.

