

## Plan: Booking Bar Enhancements + Embed Redirect Behaviour

### Summary of Issues
1. **Booking Bar** — missing date pickers (check-in/check-out), missing redirect URL info & commission warning (like Direct Link has)
2. **Widget / Full Embed / WordPress** — all currently point to `book.sleepinafrica.roomsonline.co.za/embed/property/...` which is a full page that redirects away from the iframe. These should stay **in-iframe** and not redirect. Only Direct Link and Booking Bar (fallback) should redirect.

### Changes

#### 1. BookingBarTab — Add date pickers, redirect info, commission warning

- Add description explaining: "When a guest selects dates and clicks Book, they are redirected to `book.sleepinafrica.roomsonline.co.za` to complete the booking. Commission applies per your agreement."
- Add amber commission warning box (same style as DirectLinkTab)
- Update the generated snippet to include two date inputs (check-in / check-out) in the bar HTML, passing `&checkin=` and `&checkout=` query params to the redirect URL
- The bar's "Book Now" action should open `${PUBLIC_DOMAIN}/property/${slug}?checkin=...&checkout=...&integration=booking_bar` in a new tab (redirect behaviour, like Direct Link)
- Update the snippet from an iframe to a self-contained HTML/JS bar with date pickers + a Book Now button that opens the redirect URL with dates attached
- Mention: "If you also have the Full Embed or Widget installed on your site, the bar can link to that section instead of redirecting"

#### 2. Widget / Full Embed / WordPress — Use `mode=embedded` to stay in-iframe

- Update all three embed URLs to include `&mode=embedded` param (signalling the target page should render without navigation chrome and not redirect)
- Update descriptions to clarify: "The entire booking flow happens inside the iframe — guests never leave your website"
- Remove any language suggesting redirects
- Keep commission info as "platform fee per agreement"

#### 3. WordPressTab — same embedded mode fix

- Same `&mode=embedded` param in the PHP snippet URL

### Files to Modify

| File | Change |
|------|--------|
| `BookingBarTab.tsx` | Replace iframe with HTML/JS bar snippet containing date pickers + redirect Book Now link; add commission warning; add redirect route explanation |
| `WidgetTab.tsx` | Add `&mode=embedded` to URL; update description to "stays in iframe" |
| `FullEmbedTab.tsx` | Add `&mode=embedded` to URL; update description to "stays in iframe" |
| `WordPressTab.tsx` | Add `&mode=embedded` to URL in PHP snippet; update description |

