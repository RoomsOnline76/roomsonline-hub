# Fix the payment reminder email

## What's wrong today

The reminder that went out for Jongensfontein.com asked for both payments, but the account records show both were already settled:

- Once-off setup ROL-SET-JON-202608-003 — ZAR 2 150.00 — **paid**
- Subscription activation ROL-SUB-JON-202608-001 — ZAR 3 770.00 — **paid**

Two separate causes, both confirmed in the reminder builder:

1. The setup line falls back to the full contracted setup total when there is no *open* setup invoice, instead of the outstanding balance. Once the fee is paid the balance is zero, but the email still prints ZAR 2 150.00 as "due now".
2. The monthly line falls back to the contracted monthly fee the same way, so a paid/active subscription still shows as owing (and the amount shown, ZAR 2 460.00, is not even the amount collected).

There is also no easy way for the owner to pay: buttons only appear when an unpaid invoice with a gateway token exists, so a reminder can arrive with no payment link at all.

## What will change

**1. Only remind for what is actually outstanding**

- Setup line uses the outstanding setup balance; omitted entirely when zero.
- Monthly line only shows when the subscription is genuinely not settled for the current period.
- If nothing is outstanding, the reminder is not sent at all (the daily job records "nothing due" instead of emailing).

**2. Always give the owner a one-click way to pay**

- When a payment is outstanding but no payable invoice exists yet, the invoice is raised first so the reminder always carries a working payment link.
- Primary button: "Complete your payment" → the hosted payment page for that invoice.
- Secondary link: "View your ROL Account" for the full billing history and invoices.

**3. Rewrite the email on brand, as an appreciative reminder**

New tone and structure (Equatorial Luxe: ivory background, charcoal text, magenta accent, Italiana heading with a web-safe fallback, generous spacing):

- Heading: "Thank you for partnering with us"
- Opening: appreciation for choosing Rooms Online and ROL'OS, and for trusting us with their guests.
- A soft, clearly-labelled reminder: "A friendly reminder — one payment is still open", with a single amounts table showing only what is open, and the date it should be settled by.
- Reassurance line: no lock-in, cancel any time, and an invitation to reply if anything looks wrong or they need a different arrangement.
- Sign-off from the Rooms Online team, with the property/portfolio name and support contact in the footer.
- Subject changes from the demanding "Setup & subscription payment due by …" to something warmer, e.g. "A gentle reminder about your ROL'OS payment — Jongensfontein.com".

**4. Resend for review**

After the rewrite, the reminder is sent once to connect@roomsonline.co.za so you can see the new email. To keep this safe, the send action gains an optional test-recipient parameter so the review copy goes only to that address — the owner is not re-emailed.

## Technical notes

- `supabase/functions/subscription-billing-actions/index.ts`: fix the `send_due_reminder` fallbacks (use `setupBalance` / open-subscription state, not `setupTotal` / `fee`), short-circuit when nothing is outstanding, ensure a payable invoice exists before building links, and rewrite `reminderHtml`.
- Add optional `test_recipient` to `send_due_reminder` (staff/system only) that overrides the recipient list and skips the `email_sent_at` stamp.
- `supabase/functions/billing-subscription-cron/index.ts`: treat a "nothing outstanding" response as success rather than a failed reminder.
- Deploy both functions, then invoke `send_due_reminder` for Jongensfontein with `test_recipient: "connect@roomsonline.co.za"`.
