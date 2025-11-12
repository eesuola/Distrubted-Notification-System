FROM node:20-alpine

# Install curl for health checks and debugging
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source code
COPY . .

# Generate Prisma client
RUN npm run prisma:generate

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["npm", "start"]


