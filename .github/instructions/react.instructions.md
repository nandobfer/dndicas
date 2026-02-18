---
description: baseline of coding pattern. Should be always loaded
# applyTo: 'Describe when these instructions should be loaded' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---

# Instructions

## Code Standards
- Use TypeScript for JS files.
- Never use `var`, always use `let` or `const`.
- Always use `===` and `!==` for comparisons.
- Use arrow functions (`() => {}`) instead of named functions.
- Variable names should be in camelCase.

## Typing and Interfaces
- Never use `any` type, always define specific types or interfaces.
- Never add `@ts-ignore` unless when asked by a team member.
- Always type function parameters and return types.
- Always type React component props and state.
- Always define interfaces for complex objects and API responses.

## Structure Standards
- React components should be efficient and reusable.
- Componentization is a priority. Componentize whenever possible.
- Components should not have business logic and rules, only rendering.
- All logic used in components should be created in custom hooks that can be in the same directory as the component, but under a `hooks` subdirectory.
- Keep components small and focused on a single responsibility.

## State Management
- Declare all states together
- Declare all hooks together
- Declare all useEffects together
- Use `useReducer` for complex state management instead of multiple `useState` calls
- Avoid prop drilling by using context or state management libraries when necessary
- Use `useContext` for global state that needs to be accessed by many components, but avoid overusing it for local state that can be passed down as props.

## Props and Types
- Always define prop types (TypeScript interfaces or PropTypes)
- Use destructuring for props only when there's less than 3 props
- Keep prop drilling to a minimum

## Hooks Best Practices
- Only call hooks at the top level of components
- Follow the "Rules of Hooks"
- Name custom hooks with "use" prefix
- Memoize expensive computations with `useMemo`
- Memoize callbacks with `useCallback` when passing to optimized child components

## Performance
- Use React.memo() for expensive components that receive the same props frequently
- Avoid inline function definitions in JSX when passing to child components
- Use lazy loading for routes and heavy components
- Keep component render logic pure and fast

## File Organization
- Group related components in feature folders
- Keep utility functions in separate files

## Testing
- Write tests for critical business logic
- Test user interactions, not implementation details
- Use React Testing Library for component tests
- Mock external dependencies appropriately

## Error Handling
- Implement Error Boundaries for graceful error handling
- Handle loading and error states in async operations
- Provide meaningful error messages to users
- Log errors appropriately for debugging
- Handle empty states with adequate icon, component and text