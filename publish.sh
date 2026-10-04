#!/bin/sh
# Hosting build step: writes the app, and only the app, into dist/, with every comment stripped (build.mjs).
# Docs, notes and the local preview server stay out of the published site.
#   Cloudflare Pages / Netlify / Vercel: build command "sh publish.sh", output directory "dist".
set -e
[ -d node_modules/terser ] || npm install --no-audit --no-fund
node build.mjs
