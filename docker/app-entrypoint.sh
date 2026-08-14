#!/bin/sh
set -eu

node scripts/validate-env.mjs
node scripts/migrate.mjs
node scripts/bootstrap.mjs
exec node server.js
