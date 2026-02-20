# Implementation Plan: Regras (Reference Catalog)

**Branch**: `001-rules-catalog` | **Date**: 2026-02-20 | **Spec**: [specs/001-rules-catalog/spec.md](specs/001-rules-catalog/spec.md)
**Input**: Feature specification from `specs/001-rules-catalog/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

This feature implements a "Reference Catalog" for D&D rules (e.g., "Grapple", "Resting"). It includes a CRUD interface for administrators, a Rich Text Editor (based on Tiptap) with image upload support (via S3), and deep integration with the existing Dashboard and Audit Log systems.

The implementation will follow the architectural patterns established in `users-page.tsx`, utilizing distinct features folders, custom hooks for logic, and "Glass" UI components.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 16
**Primary Dependencies**: 
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-mention`, `@tiptap/extension-image` (New)
- `mongoose` (Existing)
- `framer-motion`, `lucide-react`, `sonner` (Existing)
**Storage**: MongoDB (Atlas) for metadata, S3 (via `src/core/storage/s3.ts`) for images.
**Testing**: Jest + React Testing Library (Unit/Integration).
**Target Platform**: Web (Admin Dashboard).
**Project Type**: Next.js App Router (Server Actions / API Routes).
**Performance Goals**: Image upload < 3s, List rendering < 200ms.
**Constraints**: Must match existing "Glass" aesthetic; Images must be hosted on S3, not Base64 in DB.
**Scale/Scope**: ~100-500 reference rules anticipated.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| :--- | :--- | :--- |
| **1. Strict TypeScript** | ✅ Pass | All new code will be strictly typed. No `any`. |
| **2. Immutable Core** | ✅ Pass | Logic resides in `src/features/rules/`. Core `s3.ts` is used, not modified. |
| **3. Separation of Concerns** | ✅ Pass | UI in `components`, Logic in `hooks`, Data in `api` & `core`. |
| **4. Context & Docs** | ✅ Pass | `aicontext/modules/rules.md` will be created. |
| **5. Quality & Security** | ✅ Pass | Zod validation, Auth via Clerk, Audit Logs implemented. |

## Project Structure

### Documentation (this feature)

```text
specs/001-rules-catalog/
├── plan.md              
├── research.md          
├── data-model.md        
├── quickstart.md        
├── contracts/           
└── tasks.md             
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (dashboard)/
│   │   └── rules/
│   │       └── page.tsx       # Main Entry Point
│   └── api/
│       ├── rules/
│       │   ├── route.ts       # GET/POST
│       │   ├── [id]/
│       │   │   └── route.ts   # PUT/DELETE
│       │   └── search/
│       │       └── route.ts   # For Mention extension
│       └── upload/
│           └── route.ts       # Image Upload Handler
├── features/
│   └── rules/
│       ├── components/
│       │   ├── rules-page.tsx        # Container
│       │   ├── rules-table.tsx       # List View
│       │   ├── rules-filters.tsx     # Search/Filter
│       │   ├── rule-form-modal.tsx   # Edit/Create
│       │   ├── rich-text-editor.tsx  # Tiptap Wrapper
│       │   └── stats-card.tsx        # Dashboard Widget
│       ├── hooks/
│       │   ├── use-rules.ts
│       │   ├── use-rule-mutations.ts
│       │   └── use-editor-config.ts
│       ├── types/
│       │   └── rules.types.ts
│       └── utils/
│           └── editor-styles.ts
└── aicontext/
    └── modules/
        └── rules.md
```

**Structure Decision**: Standard "Feature-First" architecture as seen in `src/features/users`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Justification | Mitigation |
| :--- | :--- | :--- |
| N/A | | |


| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
