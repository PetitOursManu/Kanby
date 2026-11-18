"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Dropdown menu rendered in a portal with fixed positioning, so it is never
 * clipped by scrolling columns. Closes on outside click, Escape and item click.
 */
export function Menu({
  trigger,
  children,
  align = "end",
  width = 220,
  label,
}: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu"; ref: React.Ref<HTMLButtonElement> }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  width?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = align === "end" ? r.right - width : r.left;
      left = Math.max(8, Math.min(left, vw - width - 8));
      const below = vh - r.bottom - 12;
      const above = r.top - 12;
      const h = menuRef.current?.offsetHeight ?? 240;
      const top = below >= Math.min(h, 240) || below >= above ? r.bottom + 4 : Math.max(8, r.top - 4 - Math.min(h, above));
      setPos({ top, left, maxH: Math.max(160, top > r.top ? below : above) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !btnRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next].focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey, true);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus());
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      {trigger({ onClick: () => setOpen((v) => !v), "aria-expanded": open, "aria-haspopup": "menu", ref: btnRef })}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, maxHeight: pos?.maxH }}
            className="fixed z-[60] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop animate-fade-in"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({
  onClick,
  children,
  icon,
  danger,
  disabled,
  checked,
}: {
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none transition-colors disabled:opacity-40",
        danger ? "text-danger hover:bg-danger-soft focus:bg-danger-soft" : "text-fg hover:bg-hover focus:bg-hover",
      )}
    >
      {icon && <span className={cn("shrink-0", danger ? "text-danger" : "text-muted")}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {checked && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line" role="separator" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <p className="section-title px-2.5 pb-1 pt-2">{children}</p>;
}
