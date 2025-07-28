# Build stage - Updated for Vite React app
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage  
FROM node:18-alpine AS runner
WORKDIR /app

# Copy built Vite application (dist folder instead of .next)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/vite.config.ts ./

# Install serve to run the static files
RUN npm install -g serve

EXPOSE 8080

# Serve the dist folder
CMD ["serve", "-s", "dist", "-l", "8080"]