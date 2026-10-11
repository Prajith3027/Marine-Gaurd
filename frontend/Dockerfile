# ─────────────────────────────────────────────
# AI Oil Spill Intelligence — Frontend Dockerfile
# Multi-stage production build + Nginx static server
# ─────────────────────────────────────────────

# Stage 1: Build static assets
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies using clean install
COPY package.json package-lock.json ./
RUN npm ci

# Copy frontend source code
COPY . .

# Optional build-time API URL (defaults to "" for same-origin Nginx reverse proxy)
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Compile production bundle
RUN npm run build

# Stage 2: Serve via Nginx
FROM nginx:1.27-alpine-slim AS runner

# Remove default configuration
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
