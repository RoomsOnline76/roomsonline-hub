#!/bin/bash
# Build ROL'OS WordPress CDN assets
# Usage: bash scripts/build-wp-assets.sh
# Output: dist/wp-assets/

set -e

echo "🔨 Building ROL'OS WordPress assets..."

# Build using the WP-specific Vite config
npx vite build --config vite.wp.config.ts

# Copy CSS files to output
cp src/wp-blocks/rolos-blocks.css dist/wp-assets/rolos-blocks.css
cp src/wp-blocks/rolos-frontend.css dist/wp-assets/rolos-frontend.css

echo ""
echo "✅ WordPress assets built successfully!"
echo ""
echo "Output files in dist/wp-assets/:"
ls -la dist/wp-assets/
echo ""
echo "Deploy these files to: PUBLIC_DOMAIN/wp-assets/"
echo "The PHP plugin will enqueue them automatically from the CDN URL."
