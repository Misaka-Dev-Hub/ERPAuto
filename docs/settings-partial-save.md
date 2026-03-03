# Settings Partial Save Feature

## Overview

The settings system now implements partial save functionality to prevent unintended overwrites of configuration values.

## How It Works

1. **Field Whitelist**: Only fields exposed in the UI can be modified
2. **Deep Merge**: Updates are merged with existing config, preserving unmodified fields
3. **Backup & Rollback**: Config is backed up before save; failures trigger automatic rollback

## Editable Fields

Currently editable via UI:
- `erp.url` - ERP system URL
- `erp.username` - ERP login username
- `erp.password` - ERP login password

## Adding New Editable Fields

To add a new field to the UI:

1. Add field to whitelist in `src/main/services/config/config-manager.ts`:

```typescript
const UI_EDITABLE_FIELDS: string[] = [
  'erp.url',
  'erp.username',
  'erp.password',
  'database.dbType',  // Add new field here
]
```

2. Add UI input in `src/renderer/src/pages/SettingsPage.tsx`
3. Update `handleSaveSettings` to include the new field

## API

### savePartialSettings(settings: Partial<SettingsData>)

Saves only the provided fields, preserving all existing configuration.

**Returns:** `{ success: boolean, error?: string }`

**Validation:**
- Checks whitelist before applying changes
- Returns error for unauthorized fields

## Error Handling

- **Unauthorized field**: Returns error message listing invalid fields
- **Save failure**: Automatically restores from backup
- **Backup failure**: Logs warning, continues with save

## Backup File

Location: `.env.backup` (in project root)

Created before every save operation. Used for rollback on failure.
