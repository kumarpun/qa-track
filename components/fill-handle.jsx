"use client";
import { useRef } from "react";

const SEL = (group) => `[data-fill-group="${group}"]`;
const mark = (els, on) => els.forEach((el) => el.toggleAttribute("data-fill-active", on));

/**
 * Spreadsheet-style fill handle. Drag the small square at the bottom-right of a cell up or down over
 * other cells of the same `group` (cells carry data-fill-group / data-fill-id); on release `onFill(ids)`
 * is called with the ids of the cells covered, excluding the source.
 */
export function FillHandle({ group, id, onFill, label = "Drag to fill" }) {
  const state = useRef(null);

  const covered = (targetId) => {
    const cells = [...document.querySelectorAll(SEL(group))];
    const a = cells.findIndex((c) => c.dataset.fillId === id);
    const b = cells.findIndex((c) => c.dataset.fillId === targetId);
    if (a < 0 || b < 0) return [];
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return cells.slice(lo, hi + 1);
  };

  const sourceCell = (e) => e.currentTarget.closest(SEL(group));

  const onPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    state.current = { cells: [] };
    sourceCell(e)?.setAttribute("data-fill-active", "");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "crosshair";
  };
  const onPointerMove = (e) => {
    if (!state.current) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(SEL(group));
    mark(state.current.cells, false);
    state.current.cells = over ? covered(over.dataset.fillId) : [];
    mark(state.current.cells, true);
    sourceCell(e)?.setAttribute("data-fill-active", "");
  };
  const finish = (e, commit) => {
    if (!state.current) return;
    const cells = state.current.cells;
    mark(cells, false);
    sourceCell(e)?.removeAttribute("data-fill-active");
    state.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const ids = cells.map((c) => c.dataset.fillId).filter((x) => x !== id);
    if (commit && ids.length) onFill(ids);
  };

  return (
    <span
      role="presentation"
      title={label}
      aria-label={label}
      className="absolute bottom-0.5 right-0.5 z-10 size-2.5 cursor-crosshair touch-none rounded-[2px] border border-background bg-primary opacity-0 transition-opacity group-hover/fill:opacity-100"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
    />
  );
}
