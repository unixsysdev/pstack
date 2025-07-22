# Development Commands

## Core Development Commands
```bash
# Start development server (primary)
npm run dev

# Alternative start command
npm start

# Deploy to production
npm run deploy

# Run tests
npm test

# Generate Cloudflare type definitions
npm run cf-typegen
```

## Wrangler Direct Commands
```bash
# Development server with live reload
wrangler dev

# Deploy worker to Cloudflare
wrangler deploy

# Generate TypeScript types for bindings
wrangler types

# View logs (when deployed)
wrangler tail

# Publish with custom environment
wrangler deploy --env production
```

## Testing Commands
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- index.spec.ts
```

## Package Management
```bash
# Install dependencies
npm install

# Install new dependency
npm install <package-name>

# Install dev dependency
npm install -D <package-name>

# Update dependencies
npm update
```

## Useful Development URLs
- **Local Development**: http://localhost:8787/
- **Cloudflare Dashboard**: https://dash.cloudflare.com/
- **Wrangler Docs**: https://developers.cloudflare.com/workers/wrangler/

## Common Development Workflow
1. `npm run dev` - Start local development
2. Make changes to `src/index.ts`
3. `npm test` - Run tests to verify changes
4. `npm run deploy` - Deploy to production when ready