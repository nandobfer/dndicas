# Research: Regras (Reference Catalog)

**Feature**: `001-rules-catalog`
**Status**: Completed

## 1. Rich Text Editor Technology

**Decision**: Use **Tiptap** (Headless Wrapper around ProseMirror).
**Rationale**:
- **Headless**: Allows full control over styling to match "Glass" UI (using Tailwind).
- **Extensible**: Has official plugins for Mentions (`@tiptap/extension-mention`) and Images (`@tiptap/extension-image`).
- **React Support**: First-class `@tiptap/react` hooks.
- **Community**: Large ecosystem, well-maintained.

**Alternatives Considered**:
- **Quill**: Harder to style custom toolbars to match Glass UI.
- **Slate.js**: Too low-level, requires more boilerplate for basic features.
- **Draft.js**: Deprecated/Maintenance mode.

**Dependencies to Install**:
- `@tiptap/react`
- `@tiptap/starter-kit`
- `@tiptap/extension-image`
- `@tiptap/extension-mention`
- `@tiptap/extension-placeholder` (for empty states)

## 2. Image Upload Strategy (S3)

**Decision**: Client-Side Paste -> Server-Side Handler -> S3
**Flow**:
1. User pastes image into Tiptap editor.
2. `handlePaste` event intercepts the file.
3. Client `POST /api/upload` with `FormData`.
4. Server validates file (type, size < 2MB).
5. Server calls `src/core/storage/s3.ts:uploadFile`.
6. Server returns Public URL.
7. Editor inserts image node with src = URL.
**Rationale**:
- Keeps `s3.ts` secure (server-side only credentials).
- Centralizes upload logic (can add compression/virus scan later).
- Simplified client logic (no presigned URL complexity needed for V1).

## 3. Mention System (@Ref)

**Decision**: Backend-driven Suggestion List.
**Flow**:
1. User types `@`.
2. Tiptap triggers `suggestion` plugin.
3. Client calls `GET /api/rules/search?q={query}`.
4. Server returns `[{ id, label: name }]`.
5. User selects item -> Inserts specialized Mention node `reference:{id}`.
**Rationale**:
- Ensures valid references at creation time.
- Scalable (doesn't load all rules into memory).

## 4. Dashboard Integration

**Decision**: Replace WIP Card with Reusable `StatsCard`.
**Implementation**:
- Create `src/components/ui/stats-card.tsx` (generalizing the hardcoded cards in `page.tsx`).
- Props: `title`, `count`, `icon`, `trend`, `chartData`.
- Use `framer-motion` for the mini-charts as seen in current dashboard.

## 5. Audit Log Extension

**Decision**: Extend `AuditLogExtended` model (Discriminator).
- **Entity**: `Reference`
- **Action**: `CREATE`, `UPDATE`, `DELETE`
- **Metadata**: Store `previousData` and `newData` for diffing description changes.
