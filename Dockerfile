# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./

RUN npm ci

COPY frontend/ ./

RUN npm run build

# Stage 2: Build backend
FROM node:22-alpine AS backend-builder

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Stage 3: Production image
FROM node:22-alpine AS production

WORKDIR /app

# Copy production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy backend build output
COPY --from=backend-builder /app/dist ./dist

# Copy frontend build output
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy config default (if exists)
COPY config.default.json* ./

# Create profiles directory for volume mount
RUN mkdir -p /app/profiles

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/stats || exit 1

# Start server
CMD ["node", "dist/server.js"]