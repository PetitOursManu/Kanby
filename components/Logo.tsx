import { cn } from "@/lib/utils";

/** Kanby mark: an emerald tile with three kanban columns of decreasing height. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" fill="#059669" />
      <rect x="7" y="8" width="5" height="16" rx="2" fill="#fff" />
      <rect x="13.5" y="8" width="5" height="11" rx="2" fill="#fff" fillOpacity="0.85" />
      <rect x="20" y="8" width="5" height="6" rx="2" fill="#fff" fillOpacity="0.7" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-fg">Kanby</span>
    </span>
  );
}
