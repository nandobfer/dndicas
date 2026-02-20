# Quickstart: Regras (Reference Catalog)

## API Usage

### Create a Reference

```typescript
const response = await fetch('/api/rules', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Grapple',
    description: '<p>When you want to...</p>',
    source: 'PHB p.195'
  })
});
const data = await response.json();
```

### Search References

```typescript
const response = await fetch('/api/rules?search=action&status=active');
const { items, total } = await response.json();
```

## React Hooks

### `useRules` (List)

```typescript
import { useRules } from '@/features/rules/hooks/useRules';

const { data, isLoading } = useRules({ page: 1, limit: 10, search: 'Atk' });

if (isLoading) return <Loader />;
return <RulesTable rules={data.items} />;
```

### `useRuleMutations` (Create/Update/Delete)

```typescript
import { useRuleMutations } from '@/features/rules/hooks/useRuleMutations';

const { createRule, updateRule, deleteRule } = useRuleMutations();

// Create
createRule.mutate({ name: 'Dash', description: '...', source: 'PHB' });

// Update
updateRule.mutate({ id: '123', data: { status: 'inactive' } });
```

## Components

### `RichTextEditor`

```typescript
import { RichTextEditor } from '@/features/rules/components/rich-text-editor';

<RichTextEditor
  value={htmlContent}
  onChange={(newContent) => setContent(newContent)}
  placeholder="Type a description..."
/>
```
