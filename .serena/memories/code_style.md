# Code Style and Conventions

## Formatting (Prettier Configuration)
- **Print Width**: 140 characters
- **Quotes**: Single quotes (`'` instead of `"`)
- **Semicolons**: Always required (`;`)
- **Indentation**: Tabs (not spaces)
- **Line Endings**: LF (Unix-style)

## TypeScript Configuration
- **Strict Mode**: Enabled (`"strict": true`)
- **Target**: ES2021 with ES2021 library declarations
- **Module System**: ES2022 modules with Bundler resolution
- **Import Style**: 
  - Synthetic default imports allowed
  - JSON modules can be imported
  - Force consistent casing in file names

## File Organization
- **Source Code**: All in `src/` directory
- **Tests**: In `test/` directory with `.spec.ts` suffix
- **Entry Point**: `src/index.ts` (configured in wrangler.jsonc)
- **Type Definitions**: Auto-generated in `worker-configuration.d.ts`

## Naming Conventions
- **Files**: kebab-case for configuration files, camelCase for TypeScript files
- **Worker Export**: Use `satisfies ExportedHandler<Env>` pattern
- **Functions**: async/await pattern for HTTP handlers

## Code Structure Patterns
- **Worker Handler**: Default export with `fetch()` method
- **Type Safety**: Use proper Env typing with Cloudflare bindings
- **Request Handling**: Standard Request/Response Web APIs
- **Error Handling**: Should use proper HTTP status codes

## Editor Configuration
- **Insert Final Newline**: Yes
- **Trim Trailing Whitespace**: Yes
- **Charset**: UTF-8
- **YAML Files**: 2-space indentation (exception to tabs rule)

## Best Practices
- Use TypeScript strict mode features
- Leverage Cloudflare Workers Runtime APIs
- Write both unit and integration tests
- Follow Web API standards for Request/Response handling