# Data Model: Regras (Reference Catalog)

## Entities

### Reference (Rule)

Stores canonical rules for the D&D system.

| Field | Type | Required | Description | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Yes | Unique Identifier | Auto-generated |
| `name` | String | Yes | Name of the rule | Unique, Max 100 chars |
| `description` | String | Yes | Rich Text Content (HTML) | Sanitize on output |
| `source` | String | Yes | Origin reference (e.g. PHB p.10) | Max 200 chars |
| `status` | String | Yes | Availability state | Enum: `active`, `inactive` |
| `createdAt` | Date | Yes | Creation timestamp | Auto-generated |
| `updatedAt` | Date | Yes | Last update timestamp | Auto-generated |

### Audit Log Integration

Extends `AuditLogExtended`.

| Field | Value | Notes |
| :--- | :--- | :--- |
| `entity` | `Reference` | Discriminator key |
| `action` | `CREATE` \| `UPDATE` \| `DELETE` | Operation type |
| `entityId` | `Reference._id` | Foreign Key (Pseudo) |
| `previousData` | Partial<Reference> | Snapshot before change |
| `newData` | Partial<Reference> | Snapshot after change |

## Relationships

- **Reference** does not depend on other entities.
- **Reference** is referenced by:
    - `Class` (Future)
    - `Race` (Future)
    - `Spell` (Future)
    - `RichText` Content (via Mention system `@Reference:{id}`)

## Validation Rules

- `name`: Min 3 chars, Max 100 chars. Regex: `^[a-zA-Z0-9À-ÿ\s\-\.\(\)]+$`.
- `description`: Min 10 chars. Max 50,000 chars (Rich Text payload).
- `source`: Required.
- `status`: Default `active`.
