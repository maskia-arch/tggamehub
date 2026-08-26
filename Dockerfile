# ── Multi-Stage Dockerfile for Coolify Single-Service Monolith Deployment ──

# 1. Build Vite Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Build Backend TypeScript
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# 3. Production Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies for backend
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev
WORKDIR /app

# Copy compiled backend & runtime files
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/knexfile.js ./backend/knexfile.js

# Copy compiled frontend SPA
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 5000

# Memory limit: 512MB max heap to prevent OOM on small VPS (adjust up if server has more RAM)
CMD ["node", "--no-deprecation", "--max-old-space-size=512", "backend/dist/index.js"]
