# Module: Rules Catalog (References)

This module handles the D&D Reference Rules system, allowing administrators to maintain a canonical set of rules (e.g., actions, conditions) that can be referenced by other entities.

## Key Features

- **Reference Management**: CRUD operations for Rule entities.
- **Rich Text Editor**: Custom editor using Tiptap with image upload to S3, mention support, and table insertion. Mentions are enhanced with temporary badge styling (`decorationClass`). The system includes custom boundary detection (`findSuggestionMatch`) that keeps the temporary badge/query limited to the active mention word, including only the first existing word when `@` is inserted directly before text, and a smart escape mechanism using `ArrowRight` (injecting `\u200B`) to allow exiting the mention context seamlessly.
- **Audit Logging**: Full traceability of changes via `AuditLogExtended`.
- **Dashboard Integration**: Real-time stats on existing rules.
- **Entity Preview (MentionContent)**: Renders rich HTML content including styled tables, images, dice values, and mention badges.

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

- `@tiptap/react` ecosystem (including `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-header`, `@tiptap/extension-table-cell`, `@tiptap/extension-bubble-menu`).
- `src/core/storage/s3.ts`.
- `mongoose` models.

## Features

### Table support in RichTextEditor
The `RichTextEditor` (variant `"full"`) includes a **Inserir Tabela** button (Table2 icon) in the toolbar. Clicking it inserts a 3×3 table with a header row via the TipTap Table extension. Tables in the editor have styled borders and background via Tailwind `[&_table]`, `[&_th]`, `[&_td]` classes. The selected cell is highlighted via `[&_.selectedCell]:bg-blue-500/20`.

### Table BubbleMenu (column/row management)
When the cursor is inside a table cell (`tableCell` or `tableHeader`), a floating toolbar (`TableBubbleMenu`) appears above the cursor position via `createPortal` on `document.body`. It is implemented as a React component that subscribes to editor `selectionUpdate`/`focus`/`blur` events and uses `editor.view.coordsAtPos()` to compute a `position: fixed` location.

Buttons exposed (each with `SimpleGlassTooltip`):
- **Colunas**: Adicionar coluna à esquerda (`addColumnBefore`), Adicionar coluna à direita (`addColumnAfter`), Remover coluna (`deleteColumn`)
- **Linhas**: Adicionar linha acima (`addRowBefore`), Adicionar linha abaixo (`addRowAfter`), Remover linha (`deleteRow`)
- **Destrutivo**: Excluir tabela (`deleteTable`) — button styled red

### Styled table rendering in MentionContent
`MentionContent` (in `mention-badge.tsx`) renders `<table>` HTML with visual styles inspired by `ChargesPreview`:
- Table is wrapped in a `rounded-xl overflow-hidden border border-white/10 bg-white/[0.02]` container with horizontal scroll
- `<thead>` gets `bg-white/[0.03]` background and a bottom border
- `<th>` gets `text-[9px] font-black uppercase tracking-[0.15em] text-white/30`
- `<tbody tr>` gets `border-b border-white/5 last:border-b-0`
- `<td>` gets `px-3 py-2 text-xs text-white/70`

This is applied in both `mode="block"` and `mode="inline"` since the table special-cases intercept before the inline-flatten logic.
