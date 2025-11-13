@echo off
echo Fixing dependency issues in the distributed notification system...

REM Clean up any existing lock files
echo Removing existing package-lock.json...
if exist package-lock.json del package-lock.json

REM Remove node_modules in all services and root
echo Cleaning node_modules directories...
if exist node_modules rmdir /s /q node_modules
if exist services\api-gateway\node_modules rmdir /s /q services\api-gateway\node_modules
if exist services\user-service\node_modules rmdir /s /q services\user-service\node_modules
if exist services\template-service\node_modules rmdir /s /q services\template-service\node_modules

REM Install dependencies for the entire workspace
echo Installing dependencies for the entire workspace...
npm install

REM Build all services
echo Building all services...
npm run build

echo Dependency fix completed successfully!
pause