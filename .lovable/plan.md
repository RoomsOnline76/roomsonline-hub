## Plan

1. **Fix the embedded editor URL**
   - Change the ROLOS Property Setup iframe from the non-existent `/admin/edit-property/:id` route to the actual editor route `/admin/properties/:id`.
   - Update the inline documentation/comment so it matches the real route.

2. **Fix the “Open full editor” link**
   - Keep using the required production domain `https://sleepinafrica.roomsonline.co.za`.
   - Change the path to `/admin/properties/:id?tab=<activeTab>` so it no longer opens a 404.

3. **Stop iframe remount/reload churn**
   - Remove the `key={iframeSrc}` remount trigger from the iframe unless it is proven necessary; changing `src` is enough and avoids forced React unmount/mount cycles.
   - Keep tab clicks updating state + URL in one callback.

4. **Preserve URL parameters safely**
   - Ensure `section` updates do not drop `property` and vice versa.
   - Avoid mutating the `URLSearchParams` object directly in updater callbacks; clone it before setting values to reduce router-state edge cases.

5. **Verify with browser automation**
   - Open `/pms/property-setup` with an authenticated session.
   - Watch the main URL and iframe document navigations for several seconds.
   - Confirm the iframe loads `/admin/properties/:id?...` once/stably, not `/admin/edit-property/:id`, and the page no longer repeatedly reloads.

## Technical notes

- The reproduced loop is the iframe repeatedly navigating to `/admin/edit-property/<id>?forceTabs=1&embed=1&tab=rates`, which is not registered in `App.tsx`; it hits `NotFound`, logs a 404, then keeps reloading inside the iframe.
- The actual registered route is `/admin/properties/:id`.