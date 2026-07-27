Plan to unblock preview login:

1. **Make preview bypass absolute**
   - Treat Lovable preview, Lovable dev, localhost, and IP local hosts as a no-reCAPTCHA environment.
   - In bypass mode, do not mount the Google reCAPTCHA provider at all.

2. **Harden the login gate**
   - Update the login reCAPTCHA hook so bypass mode always forces `isVerified: true`, even after retries, refreshes, or provider load failures.
   - Update `/auth` submit-button and overlay logic so preview bypass cannot disable login or show the “Verification failed” modal.

3. **Keep production protection intact**
   - Preserve normal native reCAPTCHA on `roomsonline.co.za` domains.
   - Preserve bridge mode for white-label domains.

4. **Verify in preview**
   - Load `/auth` on the local/preview host and confirm the login form is usable without the verification modal blocking it.