## Plan

1. **Fix the ROLOS condition mismatch**
   - The current UI only shows the HyperGuest Hotel ID field when `selectedPMS` is `"hyperguest"` or `"rolos"`.
   - The screenshot shows the ROLOS value is actually stored/rendered as `"roomsonline"`, so the condition misses ROLOS properties.
   - Update the General tab so the HyperGuest ID field and **Search by name** button show for both `"roomsonline"` and any legacy `"rolos"` value.

2. **Make the field save for ROLOS properties**
   - Check the save path currently only writes `external_id` when PMS is `"hyperguest"`.
   - Extend it so ROLOS/Roomsonline properties can persist the optional HyperGuest Hotel ID instead of discarding it on save.

3. **Keep HyperGuest-only behavior required**
   - Keep the field required only when PMS is HyperGuest.
   - Keep it optional for ROLOS properties.

4. **Verify on the Dassiesingel edit screen**
   - Confirm the General tab shows **HyperGuest Hotel ID** and **Search by name** next to/under the ROLOS PMS row.
   - Confirm selecting/searching an ID marks the form dirty and the value remains after save/reload.