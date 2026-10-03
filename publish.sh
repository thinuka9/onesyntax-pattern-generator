#!/bin/sh
# Hosting build step: copies the app, and only the app, into dist/.
# Docs and the local preview server stay out of the published site.
#   Cloudflare Pages / Netlify / Vercel: build command "sh publish.sh", output directory "dist".
set -e
rm -rf dist
mkdir dist
cp -r index.html engine.js brand dist/
