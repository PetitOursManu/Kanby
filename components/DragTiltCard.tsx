"use client";

import { useMotionValue, useSpring, motion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Wraps a card in a sortable item that tilts (rotateX/rotateY) while dragged,
 * following the cursor/drag delta, and springs back to flat on drop.
 */
export function DragTiltCard({
  id,
  children,
  isDragging,
}: {
  id: string;
  children: ReactNode;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: dndDragging } =
    useSortable({ id });

  const rx = useSpring(useMotionValue(0), { stiffness: 300, damping: 25 });
  const ry = useSpring(useMotionValue(0), { stiffness: 300, damping: 25 });

  const movedRef = useRef(false);

  useEffect(() => {
    if (!dndDragging) {
      rx.set(0);
      ry.set(0);
      return;
    }
    movedRef.current = true;
    const dx = transform?.x ?? 0;
    const dy = transform?.y ?? 0;
    const tiltY = Math.max(-12, Math.min(12, dx / 12));
    const tiltX = Math.max(-12, Math.min(12, -dy / 12));
    ry.set(tiltY);
    rx.set(tiltX);
  }, [dndDragging, transform, rx, ry]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    rotateX: rx,
    rotateY: ry,
    transformPerspective: 600,
  } as never;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (movedRef.current) {
          e.stopPropagation();
          e.preventDefault();
        }
        movedRef.current = false;
      }}
      className={cn(
        "touch-none",
        isDragging ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      {children}
    </motion.div>
  );
}