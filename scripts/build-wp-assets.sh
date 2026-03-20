#!/bin/bash
# Build ROL'OS WordPress CDN assets (one entry at a time for IIFE compat)
set -e

echo "🔨 Building ROL'OS WordPress assets..."

rm -rf dist/wp-assets

WP_ENTRY=blocks npx vite build --config vite.wp.config.ts
WP_ENTRY=availability npx vite build --config vite.wp.config.ts
WP_ENTRY=admin npx vite build --config vite.wp.config.ts

cp src/wp-blocks/rolos-blocks.css dist/wp-assets/rolos-blocks.css
cp src/wp-blocks/rolos-frontend.css dist/wp-assets/rolos-frontend.css

echo ""
echo "✅ WordPress assets built:"
ls -la dist/wp-assets/
