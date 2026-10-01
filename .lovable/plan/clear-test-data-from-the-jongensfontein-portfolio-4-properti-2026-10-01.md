# Clear test data from the Jongensfontein portfolio (4 properties)

Applies to Tidal Pools, Fonteinhutte, Dassiesingel and Seesig, and to the Jongensfontein.com portfolio.

## What the database shows today (checked)
- All four use the owner email rooms@roomsonline.co.za, and three contracts are filed under that email. Their listing status is "contract signed" (Dassiesingel says "onboarding"). None of them show on the website.
- All four have channel location 83272 set.
- The portfolio has the verified domain book.rolos.co.za (marked active).

## Steps
1. **Remove the domain**: clear book.rolos.co.za from the portfolio and from each property's settings (status goes back to "not set up").
2. **Remove contracts**: void the owner contracts and property contracts for these four properties, and set their listing status to "no contract". Contracts are filed by owner email, so I'll first check that no property outside this portfolio uses rooms@roomsonline.co.za. If one does, I'll only remove the contracts linked to these four.
3. **Remove company information**: business name, registration and VAT numbers, mobile, postal address, key representative, banking details, channel company profile, legal representative and the channel location.
4. **Remove the other channel-required fields** (the fields with pink borders): street address, postal code, map coordinates, check-in and check-out times, arrival instructions, cancellation policy and payment methods, property type and changeover rules, plus each unit's floor, size, bathrooms, toilets, bed setup and amenity mapping. All 13 onboarding steps go back to "pending", channel sending stays off, and any queued channel requests or listing IDs are cleared.
5. **Keep only true information**: read jongensfontein.com and compare it with what is left on each property (name, description, photos, unit names, sleeping capacity, town). Anything the site confirms stays. Anything it doesn't confirm gets cleared.
6. **Check the result**: no domain, no contract, every onboarding step pending, the properties absent from the website and the onboarding list, and a short report per property listing what was kept and what was removed.

Change history and logs are kept for the record.

## Technical notes
- Make the existing sterilize action able to handle a whole portfolio, and add clearing of company info, domains and contracts. Run it from the Advanced area of the channel monitor.
- The new contract rule (the latest contract decides eligibility) means voiding the contracts automatically blocks listing and booking.
