export function formatAge(days: number): string {
  if (days === 0) return "now";
  if (days < 7) return `${days}d`;
  if (days < 14) return "1w";
  if (days < 21) return "2w";
  if (days < 30) return "3w";
  return `${Math.floor(days / 30)}mo`;
}

export function ageColor(days: number, bucket: string): string {
  // Bucket-relative thresholds
  if (bucket === "today") {
    if (days >= 3) return "text-accent-red";
    if (days >= 1) return "text-accent-amber";
    return "text-text-muted";
  }
  if (bucket === "soon") {
    if (days >= 14) return "text-accent-red";
    if (days >= 7) return "text-accent-amber";
    return "text-text-muted";
  }
  if (bucket === "later") {
    if (days >= 30) return "text-accent-red";
    if (days >= 14) return "text-accent-amber";
    return "text-text-muted";
  }
  // someday — age doesn't matter
  return "text-text-muted";
}

export function formatCompostAge(updatedAt: string): string {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return "composted today";
  if (days === 1) return "composted 1 day ago";
  if (days < 7) return `composted ${days} days ago`;
  if (days < 14) return "composted 1 week ago";
  const weeks = Math.floor(days / 7);
  if (days < 30) return `composted ${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "composted 1 month ago";
  return `composted ${months} months ago`;
}

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
