# Tech Stack

## Runtime & Platform
- **Cloudflare Workers**: Edge computing runtime
- **Wrangler**: Official CLI tool for Cloudflare Workers development and deployment
- **Compatibility Date**: 2025-07-22 (uses latest Cloudflare Workers features)

## Language & Type System
- **TypeScript 5.5.2**: Strong typing with modern ES2021 features
- **Target**: ES2021
- **Module System**: ES2022 with Bundler module resolution
- **JSX Support**: react-jsx (though not currently used)

## Development & Testing
- **Vitest ~3.2.0**: Modern testing framework
- **@cloudflare/vitest-pool-workers ^0.8.19**: Cloudflare Workers-specific test pool
- **Node.js Package Management**: npm (package-lock.json present)

## Code Quality Tools
- **Prettier**: Code formatting with tabs, single quotes, 140 char width
- **EditorConfig**: Consistent editor settings across team
- **TypeScript Strict Mode**: Enabled for maximum type safety

## Build & Deployment
- **Wrangler**: Handles building, testing, and deployment to Cloudflare
- **No bundler required**: Wrangler handles bundling internally
- **Source Maps**: TypeScript compilation with full error reporting

## Configuration Files
- `wrangler.jsonc`: Worker configuration with comments
- `tsconfig.json`: TypeScript compiler configuration
- `vitest.config.mts`: Test runner configuration
- `worker-configuration.d.ts`: Auto-generated type definitions