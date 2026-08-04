# Update Channel Manager unavailable-state copy

## Goal
Replace the current unavailable-state message in the Rentals United White Label Channel Manager embed with the user-provided, TOBI-branded copy.

## Current state
`src/components/pms/channels/RuWhiteLabelEmbed.tsx` (lines 131–134) currently shows:

```text
Your Rentals United account is connected.
The Channel Manager sign-in is being finalised — this is not a setup problem on your side. Nothing further is needed from you.
```

## Change
When `reason === "awaiting_wl_token" || subUserVerified`, update the rendered title and body to:

```text
Your ROL'OS account is connected.

The Channel Manager sign-in is being finalised — this is not a setup problem on your side. Nothing further is needed from you.

Your ROL'OS connection is fine — the Channel Manager sign-in still needs to be finalised by TOBI.
```

## Implementation detail
- Split the message into a title (`<p className="font-medium">`) plus three body paragraphs, preserving the existing styling classes.
- Keep the existing retry button and staff-only diagnostic message untouched.

## Verification
- Build/typecheck the project.
- Confirm the new copy renders in the unavailable state for a property with a verified sub-user but no White Label token.
