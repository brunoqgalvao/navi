# Optimistic Updates Skill

Apply optimistic UI updates to make the app feel snappy. Update UI immediately, persist in background, revert on failure.

## Pattern

```typescript
// BEFORE (laggy - waits for server)
async function updateThing(id: string, data: Data) {
  await api.things.update(id, data);  // User waits here...
  things = things.map(t => t.id === id ? { ...t, ...data } : t);
}

// AFTER (optimistic - instant feedback)
function updateThing(id: string, data: Data) {
  const previous = things;  // Save for rollback
  things = things.map(t => t.id === id ? { ...t, ...data } : t);  // Update immediately
  api.things.update(id, data).catch(() => {
    things = previous;  // Revert on failure
  });
}
```

## Rules

1. **Save previous state** before mutating
2. **Update UI immediately** (no `await`)
3. **Fire API in background** (no `await`)
4. **Revert on failure** in `.catch()`
5. **Keep function sync** when possible (remove `async` if not needed elsewhere)

## When to Use

- Reordering (drag & drop)
- Toggling (pin, favorite, archive)
- Quick updates (rename, status changes)
- Any action where perceived speed > consistency

## When NOT to Use

- **Creates** that need server-generated IDs
- **Deletes** that cascade or have side effects
- **Destructive actions** that can't be easily reverted
- **Actions needing server validation** before showing result

## Advanced: With Error Toast

```typescript
function updateThing(id: string, data: Data) {
  const previous = things;
  things = things.map(t => t.id === id ? { ...t, ...data } : t);
  api.things.update(id, data).catch((e) => {
    things = previous;
    showError({ title: "Update Failed", message: "Could not save changes", error: e });
  });
}
```

## Advanced: With Loading State

For longer operations, show subtle loading indicator without blocking:

```typescript
function updateThing(id: string, data: Data) {
  const previous = things;
  things = things.map(t => t.id === id ? { ...t, ...data, _saving: true } : t);
  api.things.update(id, data)
    .then(() => {
      things = things.map(t => t.id === id ? { ...t, _saving: false } : t);
    })
    .catch(() => {
      things = previous;
    });
}
```

## Checklist for Applying

- [ ] Is this a non-destructive operation?
- [ ] Can the UI state be easily reverted?
- [ ] Does the user expect instant feedback?
- [ ] Is server validation not required before showing result?

If all yes, make it optimistic!
