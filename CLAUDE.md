# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Application

```bash
npm run dev              # Start development server with hot reload
npm run build            # Full build with type checking
npm run build:win        # Build Windows executable
```

### Code Quality

```bash
npm run lint             # ESLint check
npm run format           # Prettier format
npm run typecheck        # TypeScript check (both main and renderer)
npm run typecheck:node   # TypeScript check for main process only
npm run typecheck:web    # TypeScript check for renderer only
```

### Testing

```bash
npm run test             # Run unit tests (Vitest)
npm run test:coverage    # Run tests with coverage report
npm run test:e2e         # Run E2E tests (Playwright)
npm run test:e2e:ui      # Run E2E tests with UI
npm run test:e2e:report  # Show E2E test report
```

## Architecture Overview

ERPAuto is an **Electron desktop application** for automating ERP system data processing. The application follows the classic Electron architecture with three distinct processes:

### Process Structure

1. **Main Process** (`src/main/`)
   - Node.js environment managing application lifecycle
   - Entry point: `src/main/index.ts`
   - Registers all IPC handlers via `registerIpcHandlers()`
   - Loads configuration from `config.yaml` via ConfigManager at startup

2. **Preload Script** (`src/preload/`)
   - Security bridge between main and renderer processes
   - Exposes type-safe APIs via `contextBridge` as `window.electron` and `window.api`
   - Central API surface organized by domain (auth, extractor, cleaner, database, etc.)

3. **Renderer Process** (`src/renderer/`)
   - React 19 + TypeScript UI
   - Uses exposed preload APIs for all main process communication
   - Authentication-based routing with role-based access control

### Service Architecture

The main process is organized around domain-specific services in `src/main/services/`:

- **ERP Services** (`services/erp/`): Browser automation using Playwright
  - `ExtractorService` - Downloads material plan data
  - `CleanerService` - Deletes specified materials with dry-run support
  - `ErpAuthService` - Handles ERP authentication
  - `OrderResolverService` - Validates and resolves order numbers
  - `locators.ts` - ERP element selectors

- **Database Services** (`services/database/`): Dual database support
  - `MySqlService` / `mysql.ts` - MySQL operations
  - `SqlServerService` / `sql-server.ts` - SQL Server operations
  - DAO pattern: `discrete-material-plan-dao.ts`, `materials-to-be-deleted-dao.ts`

- **User Services** (`services/user/`): Authentication and session management
  - `BipUsersDao` - User data access
  - `SessionManager` - Active session tracking

- **Other Services**:
  - `config/` - Configuration management
  - `excel/` - Excel file parsing

### IPC Handler Pattern

All IPC communication follows a consistent pattern:

- Handlers are in `src/main/ipc/`, organized by domain (8 modules)
- Each handler module exports a `register*Handlers()` function
- All handlers are registered in `src/main/ipc/index.ts`
- Channel naming follows `domain:action` convention (e.g., `extractor:run`, `auth:login`)

### Authentication Flow

The application implements a multi-stage authentication system:

1. **Silent Login**: On startup, attempts automatic login using computer name
2. **Fallback**: Shows login dialog if silent login fails
3. **Admin User Selection**: Admin users can switch to other user accounts
4. **Session Management**: Persistent sessions with role-based permissions (Admin/User/Guest)

Admin users see logout buttons and can access user switching. Non-admin users have restricted access based on the user who initiated their session.

### Type System

- Separate TypeScript configs: `tsconfig.node.json` (main/preload) and `tsconfig.web.json` (renderer)
- Types are co-located with features: `src/main/types/` contains domain-specific type definitions
- The preload script exposes a typed API surface that's available in renderer

### Path Aliases

- `@renderer` → `src/renderer/src` (renderer process)
- `@main` → `src/main` (main process, tests only)
- `@services` → `src/main/services` (main process, tests only)
- `@types` → `src/main/types` (main process, tests only)

## Configuration Management

The application uses a YAML-based configuration system (`config.yaml`) managed by `ConfigManager`:

- **Development**: `config.yaml` in project root (easy to edit and version control)
- **Production**: `config.yaml` in user data directory (AppData on Windows)

Key configurations in `config.yaml`:

- **ERP Settings**: URL (fixed infrastructure)
- **Database**: MySQL and SQL Server connection configs (dual support)
- **Paths**: Data directory and output file settings
- **Extraction**: Batch size, verbosity, persistence options
- **Validation**: Data source, batch size, match mode
- **Order Resolution**: Database table and field names for order number lookup

Note: ERP credentials (username/password) are stored in the database (`dbo_BIPUsers` table) per user, managed via the Settings UI.

## Key Technologies

- **Electron 39** - Desktop framework
- **React 19** - UI framework
- **TypeScript 5.9** - Type safety
- **Playwright 1.58** - Browser automation for ERP interaction
- **electron-vite + Vite 7** - Build tooling
- **Zod** - Runtime validation
- **Vitest** - Unit tests
- **Playwright Test** - E2E tests
