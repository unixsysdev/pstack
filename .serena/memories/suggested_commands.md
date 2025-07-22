# Suggested Shell Commands for pstack

## Essential Development Commands
```bash
# Start development server
npm run dev

# Run tests
npm test

# Deploy to production  
npm run deploy

# Install dependencies
npm install
```

## Wrangler-Specific Commands
```bash
# Start local development with hot reload
wrangler dev

# Deploy worker
wrangler deploy  

# View real-time logs
wrangler tail

# Generate TypeScript types
wrangler types

# List deployments
wrangler deployments list
```

## Testing and Quality Assurance
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- index.spec.ts

# Check TypeScript compilation (no output)
npx tsc --noEmit
```

## File System Operations (Windows)
```cmd
# Navigate to project
cd C:\Users\marce\WorkSpace\pstack\shiny-haze-54b4

# List files
dir
dir /a /s    # Show all files recursively

# Search for text in files
findstr /s /i "pattern" *.*

# View file contents
type src\index.ts
type package.json
```

## Git Operations
```bash
# Check status
git status

# Stage changes
git add .
git add src/index.ts

# Commit changes
git commit -m "feat: add new functionality"

# Push to remote
git push origin master

# View commit history
git log --oneline
```

## Development Workflow Commands
```bash
# Full development cycle
npm install          # Install dependencies
npm run dev         # Start development
# (make changes)
npm test           # Run tests
npm run deploy     # Deploy when ready

# Quick iteration
npm run dev        # Keep running in background
# (edit files)
npm test          # Test changes
```

## Debugging and Monitoring
```bash
# View deployment logs
wrangler tail --format pretty

# Check worker status
wrangler deployments list

# Local development logs
npm run dev -- --local

# Test specific endpoint
curl http://localhost:8787/
```

## Package Management
```bash
# Update dependencies
npm update

# Add new dependency
npm install <package-name>

# Add dev dependency  
npm install -D <package-name>

# Remove dependency
npm uninstall <package-name>

# Check outdated packages
npm outdated
```