export function DomainBadge({ color, name }: { color: string; name?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      {name && <span className="text-xs text-text-secondary">{name}</span>}
    </span>
  );
}
