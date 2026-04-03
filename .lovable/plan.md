

# Redesign Review Badges to Match Premium Reference Style

## What changes
The current `ShowcaseReviewsBadge` renders flat, pastel-colored pills with a single tiny star and plain text. The reference image shows a much more impactful design: a frosted glass pill with the actual Google "G" logo in full color, the numeric rating in bold, a row of 5 filled gold stars, and the review count — all on a semi-transparent dark backdrop.

## Design

The new badge will be a wider, more prominent pill with:
- **Frosted glass effect**: `bg-black/40 backdrop-blur-md` for contrast against hero images
- **Google colored "G"**: An inline SVG of the multi-color Google "G" icon (not a plain letter)
- **Bold rating number**: Large, white, semibold (e.g. "4.7")
- **5 gold stars**: Row of filled/unfilled star icons in amber/gold, sized larger than current
- **Review count**: White text showing "{n} reviews"
- TripAdvisor and Booking.com badges get similar treatment with their respective brand colors/icons

## File to change

| File | Change |
|------|--------|
| `src/components/showcase/ShowcaseReviewsBadge.tsx` | Replace current design with frosted-glass pill, inline SVG brand icons (Google multicolor G, TripAdvisor owl green, Booking.com blue B), larger gold star row, bolder typography, semi-transparent dark background |

