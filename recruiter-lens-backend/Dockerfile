# syntax=docker/dockerfile:1

# =============================================================================
# Recruiter Lens backend — production image
# =============================================================================
# Base: node:22-bookworm-slim  (Debian 12 "bookworm", glibc, Node 22 LTS)
#   - Node 22.3+ satisfies the engine requirement of pdf-parse / pdfjs-dist
#     (they require >=20.16 <21 || >=22.3 — note Node 21 is NOT supported).
#   - glibc (NOT Alpine/musl) is required so the prebuilt @napi-rs/canvas
#     binary that pdf-parse depends on loads correctly. That binary links only
#     core glibc libraries (libc, libm, libgcc_s, libpthread, librt, libdl),
#     all already present in -slim, so NO extra `apt-get install` is needed.
#
# IMPORTANT — architecture: @napi-rs/canvas ships a CPU-architecture-specific
# binary chosen at install time. Build this image for the SAME architecture as
# the machine that will run it. For a standard x86_64 EC2 instance (t3.*),
# build for linux/amd64 (the default on an x64 builder / x64 GitHub runner).
# =============================================================================


# ---- Base -------------------------------------------------------------------
FROM node:22-bookworm-slim AS base
WORKDIR /app


# ---- Dependencies -----------------------------------------------------------
# Install ONLY production dependencies (this omits nodemon). Copying just the
# manifests first means Docker re-runs `npm ci` only when they actually change,
# keeping rebuilds fast.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev


# ---- Runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
# The app reads process.env.PORT and falls back to 3000; keep them aligned.
ENV PORT=3000

# Bring in the pre-installed production node_modules from the deps stage,
# then copy the application source. (.dockerignore keeps node_modules, .env,
# and .git out of this COPY.)
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Drop root: run as the unprivileged "node" user that the base image provides.
USER node

EXPOSE 3000

# Liveness check: hit a route that responds WITHOUT calling Zoho or Supabase.
# A request to "/" with no API key returns 401 immediately (the API-key
# middleware rejects it before any external call), which still proves the
# HTTP server is up. Any HTTP response = healthy; only a connection failure
# marks the container unhealthy. Uses Node's built-in fetch, so the image
# needs no curl/wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(()=>process.exit(0)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
