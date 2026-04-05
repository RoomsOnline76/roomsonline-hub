

# Room Type Images: Use Room Images + Random Property Fallback

## Problem
1. Room cards on portfolio property pages always pick `images[0]` — no variety when multiple rooms fall back to property images (every room shows the same property hero shot)
2. When a room has no images, the fallback should randomly select from the property's image library, not always show the first one

## Changes

### 1) `src/pages/EmbedProperty.tsx` — Room card image selection (line ~759-762)
- When `roomImages` is empty and falling back to property images, pick a random image from the property's `images` array (seeded by room index for deterministic rendering across re-renders)
- Use a simple hash: `propertyImages[roomIndex % propertyImages.length]` or a deterministic shuffle based on room ID

### 2) `src/components/showcase/RoomCollection.tsx` — Same fix (line ~104-105)
- When `room.images` is empty and using `propertyImages` fallback, pick image based on room index rather than always `[0]`
- `const heroImage = roomImages[room.images?.length ? 0 : Math.abs(hashCode(room.id)) % roomImages.length]`

### 3) `src/components/showcase/CategoryCollection.tsx` — Check if same pattern exists there
- Apply identical fix if it uses the same `propertyImages[0]` fallback

## Approach
Use a deterministic selection (hash of room ID modulo image count) so the same room always shows the same fallback image across renders, but different rooms show different property images.

## Files Changed
| File | Change |
|---|---|
| `src/pages/EmbedProperty.tsx` | Random property image fallback per room card |
| `src/components/showcase/RoomCollection.tsx` | Random property image fallback per room card |
| `src/components/showcase/CategoryCollection.tsx` | Same fix if applicable |

