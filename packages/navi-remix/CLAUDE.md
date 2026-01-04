# Navi Remix - Project Instructions

A React/Remix port of the Navi Svelte app - a GUI for Claude Code.

## CRITICAL: Avoiding React Infinite Loops

This app has had issues with `Maximum update depth exceeded` errors. Follow these rules strictly:

### 1. NEVER trigger state updates during render

**NEVER do this:**
```tsx
function Component() {
  const [count, setCount] = useState(0);

  // BAD: This runs during render and causes infinite loop
  if (someCondition) {
    setCount(count + 1);
  }

  // BAD: queueMicrotask during render still causes loops
  if (valueChanged) {
    queueMicrotask(() => setSomeState(newValue));
  }
}
```

**DO this instead:**
```tsx
function Component() {
  const [count, setCount] = useState(0);

  // GOOD: Side effects go in useEffect
  useEffect(() => {
    if (someCondition) {
      setCount(c => c + 1);
    }
  }, [someCondition]);
}
```

### 2. Store callbacks in refs to avoid effect dependencies

When passing callbacks to effects, store them in refs to prevent the effect from re-running:

```tsx
// GOOD: Callback stored in ref, effect only depends on the value
const onChangeRef = useRef(onChange);
onChangeRef.current = onChange;

useEffect(() => {
  onChangeRef.current?.(value);
}, [value]); // onChange is NOT in deps
```

### 3. Use stable empty references

```tsx
// GOOD: Module-level constant
const EMPTY_ARRAY: never[] = [];
const EMPTY_MAP = new Map();

function Component() {
  const messages = sessionId
    ? messagesMap.get(sessionId) || EMPTY_ARRAY
    : EMPTY_ARRAY;
}
```

### 4. Zustand selectors must be primitive or stable

```tsx
// BAD: Creates new object every render
const { projectId, sessionId } = useStore();

// GOOD: Select primitives individually
const projectId = useStore(s => s.projectId);
const sessionId = useStore(s => s.sessionId);

// GOOD: Or use shallow equality
const { projectId, sessionId } = useStore(
  s => ({ projectId: s.projectId, sessionId: s.sessionId }),
  shallow
);
```

### 5. Track previous values with refs, not state

```tsx
// GOOD: Use ref to track previous value
const prevValueRef = useRef(value);

useEffect(() => {
  if (prevValueRef.current !== value) {
    // Handle change
    prevValueRef.current = value;
  }
}, [value]);
```

### 6. useCallback dependencies must be stable

```tsx
// BAD: callback recreated every render if `data` is object/array
const handleClick = useCallback(() => {
  process(data);
}, [data]); // data might be new object each render!

// GOOD: Use ref for unstable values
const dataRef = useRef(data);
dataRef.current = data;

const handleClick = useCallback(() => {
  process(dataRef.current);
}, []); // No deps, always stable
```

## Architecture Patterns

### Hash Router
- Uses `useSyncExternalStore` for hash state
- Change callbacks fire in `useEffect`, NOT during render
- Callbacks stored in refs to avoid effect deps

### Data Loading
- `useDataLoader` provides callbacks for route changes
- Module-level caching prevents duplicate fetches
- Callbacks update zustand stores

### State Management
- Zustand stores for global state
- Props for component-specific state
- Refs for values that shouldn't trigger re-renders

## Light Theme

The app uses a light theme (white/gray):
- `bg-white`, `bg-gray-50` for backgrounds
- `text-gray-900`, `text-gray-700` for text
- `border-gray-200` for borders
- `rounded-xl` for cards and buttons

## Development

```bash
bun run dev      # Start dev server (port 3002)
bun run build    # Build for production
```

Server runs on port 3002 (vs 3001 for Svelte app).
