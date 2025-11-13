#!/bin/bash

echo "Fixing dependency issues in the distributed notification system..."

# Clean up any existing lock files
echo "Removing existing package-lock.json..."
rm -f package-lock.json

# Remove node_modules in all services and root
echo "Cleaning node_modules directories..."
rm -rf node_modules
rm -rf services/api-gateway/node_modules
rm -rf services/user-service/node_modules
rm -rf services/template-service/node_modules

# Install dependencies for the entire workspace
echo "Installing dependencies for the entire workspace..."
npm install

# Build all services
echo "Building all services..."
npm run build

echo "Dependency fix completed successfully!"