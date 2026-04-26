# React: Duplicate Keys in Static Config Arrays Cause Silent Render Loops

## The Pattern

Static config arrays drive a lot of UI in this codebase:

```ts
const LAYOUTS = [
  { value: "list",    label: "List",    ... },
  { value: "grouped", label: "Grouped", ... },
  { value: "grouped", label: "Grouped", ... }, // ← duplicate, TypeScript won't catch this
  { value: "matrix",  label: "Matrix",  ... },
];
```

When `value` becomes the React `key`, two elements share the same key. React reconciles them as one — and can fire `onChange` spuriously during reconciliation passes.

## The Symptom

Looks exactly like a state management or effect bug:
- Browser flashes / re-renders constantly
- `[HMR] connected` keeps appearing (full page reloads)
- DevTools can't be opened fast enough to catch console output
- `useCallback` deps, `useEffect` chains, and API calls all look correct

The misdirection is total. You'll chase effects, stale closures, 401 redirects, and `getAppState()` calls before finding one line of bad data.

## The Fix

Remove the duplicate entry. Also use compound keys as insurance:

```tsx
{LAYOUTS.map((layout, i) => (
  <button key={`${layout.value}-${i}`} ...>
```

The index suffix means even a future duplicate won't cause a key collision.

## The Rule

**Any time you add an entry to a `LAYOUTS`, `TABS`, `BUCKETS`, or similar static config array, scan for duplicate `value` fields.** TypeScript validates shape, not uniqueness.

Arrays that drive rendered lists with `key={item.value}`:
- `LAYOUTS` in `layout-switcher.tsx`
- `BUCKET_TABS` in `grouped-layout.tsx` and `quadrant-layout.tsx`
- `BUCKETS` in `matrix-layout.tsx`
- Any future tab/option array
