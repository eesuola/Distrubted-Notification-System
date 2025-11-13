# Dependency Fix for Distributed Notification System

## Issue Description

The CI/CD pipeline is failing due to mismatches between `package.json` and `package-lock.json` files in the distributed notification system project. This is a common issue in monorepo projects with npm workspaces.

## Root Cause

The root `package-lock.json` file contains dependencies for all workspaces, but it has become out of sync with the individual `package.json` files in the services directories. This can happen when:

1. Dependencies are updated in individual services without regenerating the lock file
2. The lock file is manually edited
3. Different versions of npm are used across environments

## Solution

### Automated Fix

Run the provided script to fix all dependency issues:

```bash
chmod +x fix-dependencies.sh
./fix-dependencies.sh
```

This script will:
1. Remove the existing `package-lock.json` file
2. Clean all `node_modules` directories
3. Reinstall all dependencies for the entire workspace
4. Build all services

### Manual Fix

If you prefer to fix the issue manually:

1. Clean up existing lock files and node_modules:
   ```bash
   rm -f package-lock.json
   rm -rf node_modules
   rm -rf services/*/node_modules
   ```

2. Reinstall dependencies:
   ```bash
   npm install
   ```

3. Build all services:
   ```bash
   npm run build
   ```

## Verification

After fixing the dependencies, verify that:

1. The `package-lock.json` file is consistent with all `package.json` files
2. All services can be built successfully:
   ```bash
   npm run build
   ```
3. All tests pass:
   ```bash
   npm test
   ```

## Prevention

To prevent this issue in the future:

1. Always run `npm install` after updating any dependencies
2. Commit the updated `package-lock.json` file along with your changes
3. Use the same version of npm across all environments
4. Consider using `npm ci` in CI/CD pipelines for faster, more reliable installs

## Services Affected

This fix affects all services in the monorepo:
- API Gateway Service (`services/api-gateway`)
- User Service (`services/user-service`)
- Template Service (`services/template-service`)

## Additional Notes

- The project uses npm workspaces, which is why there's only one lock file at the root
- Individual services don't have their own lock files
- All dependencies are managed from the root directory