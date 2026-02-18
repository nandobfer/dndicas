# Regras Gerais de Desenvolvimento

> **Baseline of coding pattern. Should be always loaded.**

---

## Code Standards

- Use TypeScript for JS files.
- Never use `var`, always use `let` or `const`.
- Always use `===` and `!==` for comparisons.
- Use arrow functions (`() => {}`) instead of named functions.
- Variable names should be in camelCase.
- Constants should be in UPPER_SNAKE_CASE.
- File names should use kebab-case for components and utilities.

## Typing and Interfaces

- **Never** use `any` type, always define specific types or interfaces.
- **Never** add `@ts-ignore` unless when asked by a team member.
- Always type function parameters and return types.
- Always type React component props and state.
- Always define interfaces for complex objects and API responses.
- Use `interface` for object shapes and `type` for unions, intersections, and primitives.
- Export interfaces and types that are used across multiple files.

## Structure Standards

- React components should be efficient and reusable.
- **Componentization is a priority.** Componentize whenever possible.
- Components should **not** have business logic and rules, only rendering.
- All logic used in components should be created in **custom hooks** that can be in the same directory as the component, but under a `hooks` subdirectory.
- Keep components small and focused on a single responsibility.
- Separate concerns: UI components, business logic (hooks), and data fetching.

## State Management

- Declare all states together.
- Declare all hooks together.
- Declare all `useEffect`s together.
- Use `useReducer` for complex state management instead of multiple `useState` calls.
- Avoid prop drilling by using context or state management libraries when necessary.
- Use `useContext` for global state that needs to be accessed by many components, but avoid overusing it for local state that can be passed down as props.
- Prefer server state management with TanStack Query over client state when dealing with API data.

## Props and Types

- Always define prop types (TypeScript interfaces).
- Use destructuring for props only when there's less than 3 props.
- Keep prop drilling to a minimum (max 2 levels).
- Use spread operator sparingly and document when used.

## Hooks Best Practices

- Only call hooks at the top level of components.
- Follow the "Rules of Hooks" strictly.
- Name custom hooks with "use" prefix (e.g., `useCharacterSheet`, `useSpellFilter`).
- Memoize expensive computations with `useMemo`.
- Memoize callbacks with `useCallback` when passing to optimized child components.
- Document complex custom hooks with JSDoc comments.

## Performance

- Use `React.memo()` for expensive components that receive the same props frequently.
- Avoid inline function definitions in JSX when passing to child components.
- Use lazy loading for routes and heavy components with `React.lazy()` and `Suspense`.
- Keep component render logic pure and fast.
- Optimize images with Next.js Image component.
- Use dynamic imports for heavy dependencies that are not needed on initial render.

## File Organization

```
src/
├── app/                    # Next.js 15 App Router
│   ├── (auth)/            # Route groups
│   ├── (public)/
│   └── api/
├── components/            # Shared components
│   ├── ui/               # Shadcn/ui components
│   └── common/           # Custom reusable components
├── features/             # Feature-based modules
│   ├── classes/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── types/
│   ├── spells/
│   └── character-sheet/
├── lib/                  # Utilities and configurations
│   ├── db/              # Database connection and models
│   ├── utils/           # Helper functions
│   └── config/          # Configuration files
├── hooks/               # Global custom hooks
├── types/               # Global TypeScript types
└── styles/              # Global styles
```

- Group related components in feature folders.
- Keep utility functions in separate files under `lib/utils/`.
- Co-locate component-specific hooks, types, and tests with the component.

## Testing

- Write tests for critical business logic (character calculations, spell interactions).
- Test user interactions, not implementation details.
- Use React Testing Library for component tests.
- Mock external dependencies appropriately.
- Aim for meaningful test coverage, not 100% for the sake of it.

## Error Handling

- Implement Error Boundaries for graceful error handling.
- Handle loading and error states in async operations.
- Provide meaningful error messages to users in Portuguese.
- Log errors appropriately for debugging (use proper logging service).
- Handle empty states with adequate icon, component and text.
- Use Next.js error.tsx and not-found.tsx for route-level error handling.
- Always validate user input on both client and server side.

## Naming Conventions

### Components
- PascalCase for component names: `CharacterSheet`, `SpellCard`
- Descriptive and specific names: `SpellFilterSidebar` not `Sidebar`

### Hooks
- Prefix with "use": `useCharacterStats`, `useSpellFilters`
- Describe what the hook does or returns

### Files
- Component files: `spell-card.tsx`
- Hook files: `use-character-stats.ts`
- Type files: `character.types.ts`
- Utility files: `calculate-modifiers.ts`

### Variables and Functions
- camelCase for variables and functions
- Boolean variables should start with `is`, `has`, `should`: `isLoading`, `hasSpells`, `shouldShowModal`
- Event handlers: `handleSubmit`, `onSpellSelect`

## Comments and Documentation

- Write self-documenting code with clear variable and function names.
- Add comments only when the "why" is not obvious from the code.
- Document complex algorithms and business logic.
- Use JSDoc for public APIs and exported functions.
- Keep comments up to date with code changes.

## Imports Organization

```typescript
// 1. React and Next.js imports
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 2. Third-party libraries
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';

// 3. Internal modules (absolute imports)
import { Button } from '@/components/ui/button';
import { useCharacterSheet } from '@/features/character-sheet/hooks/use-character-sheet';

// 4. Types
import type { Character, Spell } from '@/types';

// 5. Styles (if any)
import styles from './component.module.css';
```

## Accessibility

- Use semantic HTML elements.
- Provide alt text for images.
- Ensure keyboard navigation works properly.
- Use ARIA labels when necessary.
- Test with screen readers when implementing complex UI.
- Maintain proper heading hierarchy (h1, h2, h3...).

## Git Commit Standards

- Use conventional commits: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`
- Write clear, concise commit messages in Portuguese
- Examples:
  - `feat: adiciona cadastro de classes`
  - `fix: corrige cálculo de modificador de atributo`
  - `refactor: melhora estrutura de hooks da ficha`

## Security Best Practices

- Never commit sensitive data (API keys, passwords, tokens)
- Validate all user inputs (client and server side)
- Sanitize data before rendering (especially user-generated content)
- Use environment variables for configuration
- Implement proper authentication and authorization checks
- Use HTTPS in production
- Keep dependencies up to date

## D&D Specific Conventions

### Naming D&D Entities
- Use Portuguese terms consistently:
  - `classe` not `class`
  - `raca` not `race` (avoid special characters in code)
  - `magia` not `spell`
  - `personagem` not `character`
  - `talento` not `feat`

### Calculations
- Always comment formulas with the D&D rule reference
- Example:
  ```typescript
  // Modificador = (Atributo - 10) / 2 (arredondado para baixo)
  // Ref: Player's Handbook p.13
  const modifier = Math.floor((attribute - 10) / 2);
  ```

### Constants
- Define D&D constants in centralized files:
  - `ABILITY_SCORES`, `PROFICIENCY_BONUS_BY_LEVEL`, `SPELL_LEVELS`
  - Keep them in `lib/config/dnd-constants.ts`
