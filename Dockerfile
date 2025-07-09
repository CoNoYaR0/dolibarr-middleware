# Stage 1: Build - Install dependencies
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or npm-shrinkwrap.json)
COPY package*.json ./

# Install app dependencies
# Using --omit=dev to only install production dependencies
RUN npm install --omit=dev --legacy-peer-deps

# Stage 2: Production - Copy built assets and run the app
FROM node:18-alpine

WORKDIR /usr/src/app

# Copy dependencies from builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy application code
COPY . .

# Application metadata
LABEL name="dolibarr-middleware"
LABEL version="1.0.0"

# Expose the port the app runs on
# This should match the PORT environment variable used by the application (default 3000)
EXPOSE 3000

# Define environment variable for Node environment (optional, can be set at runtime)
ENV NODE_ENV=production
# PORT can also be set here or overridden at runtime, e.g. ENV PORT=3000

# Command to run the application
# This will use the "start" script from package.json if it's `node src/server.js`
# Or directly: CMD [ "node", "src/server.js" ]
CMD [ "npm", "start" ]
