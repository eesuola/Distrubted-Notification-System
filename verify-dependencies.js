#!/usr/bin/env node

/**
 * Script to verify that package-lock.json is consistent with package.json files
 * in all workspaces
 */

const fs = require('fs');
const path = require('path');

// Read the root package.json
const rootPackageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const workspaces = rootPackageJson.workspaces || [];

// Read the package-lock.json
const packageLockJson = JSON.parse(fs.readFileSync('./package-lock.json', 'utf8'));

// Get all workspace packages
const workspacePackages = workspaces.map(workspace => {
  const workspacePath = workspace.replace('/*', '');
  const serviceDirs = fs.readdirSync(workspacePath);
  
  return serviceDirs.map(dir => {
    const packageJsonPath = path.join(workspacePath, dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return {
        name: packageJson.name,
        path: path.join(workspacePath, dir),
        packageJson
      };
    }
    return null;
  }).filter(Boolean);
}).flat();

console.log('Verifying dependencies...\n');

let hasIssues = false;

// Check if all workspace packages are in the lock file
workspacePackages.forEach(pkg => {
  // Try to find the package by name first (for newer npm versions)
  let lockPackage = packageLockJson.packages[pkg.name];
  
  // If not found by name, try to find it by path (for older npm versions)
  if (!lockPackage) {
    const packagePath = pkg.path.replace(/\\/g, '/'); // Normalize path for cross-platform
    lockPackage = packageLockJson.packages[packagePath];
  }
  
  if (!lockPackage) {
    console.error(`❌ Package ${pkg.name} not found in package-lock.json`);
    hasIssues = true;
  } else {
    console.log(`✅ Package ${pkg.name} found in package-lock.json`);
    
    // Check if versions match
    const pkgVersion = pkg.packageJson.version;
    const lockVersion = lockPackage.version;
    
    if (pkgVersion !== lockVersion) {
      console.error(`❌ Version mismatch for ${pkg.name}: package.json has ${pkgVersion}, package-lock.json has ${lockVersion}`);
      hasIssues = true;
    }
  }
});

// Check for any packages in lock file that don't exist in workspaces
Object.keys(packageLockJson.packages).forEach(pkgName => {
  if (pkgName.startsWith('node_modules/') || pkgName === '') {
    return; // Skip node_modules and root
  }
  
  // Check if the package name matches a workspace package
  const existsInWorkspace = workspacePackages.some(pkg => pkg.name === pkgName);
  
  // Also check if the package path matches a workspace package
  const existsInWorkspacePath = workspacePackages.some(pkg => {
    const normalizedPkgPath = pkg.path.replace(/\\/g, '/');
    return pkgName === normalizedPkgPath;
  });
  
  if (!existsInWorkspace && !existsInWorkspacePath && (pkgName.startsWith('@services/') || pkgName.startsWith('services/'))) {
    console.error(`❌ Package ${pkgName} found in package-lock.json but not in workspaces`);
    hasIssues = true;
  }
});

if (hasIssues) {
  console.log('\n❌ Dependency issues found. Please run the fix-dependencies script.');
  process.exit(1);
} else {
  console.log('\n✅ All dependencies are consistent!');
  process.exit(0);
}