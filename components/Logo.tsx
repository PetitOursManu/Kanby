import { cn } from "@/lib/utils";

/** Kanby mark: the white "K" on an emerald tile (public/kanby-logo.png). */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static asset, rendered at several small sizes
    <img
      src="/kanby-logo.png"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden="true"
      draggable={false}
    />
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
