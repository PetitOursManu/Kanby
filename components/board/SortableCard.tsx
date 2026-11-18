"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CardItem } from "@/components/board/CardItem";
import type { CardRow } from "@/types/api";

/**
 * Draggable card. Opening is a plain click / Enter; dragging starts after a
 * small mouse move or a long press on touch screens, so swiping a column
 * still scrolls it.
 */
export function SortableCard({
  card,
  done,
  disabled,
  onOpen,
}: {
  card: CardRow;
  done: boolean;
  disabled: boolean;
  onOpen: (card: CardRow) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", columnId: card.columnId },
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-roledescription={undefined}
      aria-label={card.title}
      data-card-id={card.id}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => {
        // Space starts a keyboard drag (dnd-kit); Enter opens the card.
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen(card);
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
      className="cursor-pointer select-none rounded-[10px] outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-accent"
    >
      <CardItem card={card} done={done} dragging={isDragging} />
    </li>
  );
}
