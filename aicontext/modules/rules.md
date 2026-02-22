# Module: Rules Catalog (References)

This module handles the D&D Reference Rules system, allowing administrators to maintain a canonical set of rules (e.g., actions, conditions) that can be referenced by other entities.

## Key Features

- **Reference Management**: CRUD operations for Rule entities.
- **Rich Text Editor**: Custom editor using Tiptap with image upload to S3 and mention support.
- **Audit Logging**: Full traceability of changes via `AuditLogExtended`.
- **Dashboard Integration**: Real-time stats on existing rules.

## Data Models

### Reference
- `name`: Unique identifier string.
- `description`: HTML content.
- `source`: Citation string.
- `status`: Active/Inactive.

## API Endpoints

- `GET /api/rules`: List/Search.
- `POST /api/rules`: Create.
- `GET /api/rules/[id]`: Retrieve single.
- `PUT /api/rules/[id]`: Update.
- `DELETE /api/rules/[id]`: Delete.
- `POST /api/upload`: Image upload handler.

## Dependencies

- `@tiptap/react` ecosystem.
- `src/core/storage/s3.ts`.
- `mongoose` models.
