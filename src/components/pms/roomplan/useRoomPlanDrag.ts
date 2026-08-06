import { useCallback, useEffect, useRef, useState } from "react";

export interface RoomPlanRowTarget {
  rowKey: string;
  roomId: string | null;
  roomTypeId: string;
}

export interface RoomPlanCreateDrag extends RoomPlanRowTarget {
  kind: "create";
  startCol: number;
  endCol: number;
}

export interface RoomPlanMoveDrag {
  kind: "move";
  bookingId: string;
  originRowKey: string;
  originRoomId: string | null;
  roomTypeId: string;
  startCol: number;
  cols: number;
  deltaCols: number;
  target: RoomPlanRowTarget;
  /** false when the drop target is a different room type or occupied. */
  valid: boolean;
}

export type RoomPlanDrag = RoomPlanCreateDrag | RoomPlanMoveDrag | null;

interface UseRoomPlanDragOptions {
  colWidth: number;
  colCount: number;
  enabled: boolean;
  /** Should a candidate move be accepted? Called on every pointer move. */
  validateMove: (drag: Omit<RoomPlanMoveDrag, "valid">) => boolean;
  onCreateCommit: (drag: RoomPlanCreateDrag) => void;
  onMoveCommit: (drag: RoomPlanMoveDrag) => void;
}

const readRowTarget = (x: number, y: number): RoomPlanRowTarget | null => {
  const element = document.elementFromPoint(x, y);
  const row = element?.closest<HTMLElement>("[data-row-key]");
  if (!row) return null;
  const rowKey = row.dataset.rowKey;
  const roomTypeId = row.dataset.roomTypeId;
  if (!rowKey || !roomTypeId) return null;
  return { rowKey, roomTypeId, roomId: row.dataset.roomId || null };
};

/**
 * Pointer-driven drag state for the Room Plan: drag across empty cells to
 * create, drag a bar to move it. No external drag-and-drop dependency.
 */
export function useRoomPlanDrag({
  colWidth,
  colCount,
  enabled,
  validateMove,
  onCreateCommit,
  onMoveCommit,
}: UseRoomPlanDragOptions) {
  const [drag, setDrag] = useState<RoomPlanDrag>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<RoomPlanDrag>(null);
  const grabColRef = useRef(0);
  const movedRef = useRef(false);

  dragRef.current = drag;

  const colFromClientX = useCallback(
    (clientX: number): number => {
      const body = bodyRef.current;
      if (!body) return 0;
      const rect = body.getBoundingClientRect();
      const x = clientX - rect.left + body.scrollLeft;
      return Math.max(0, Math.min(colCount - 1, Math.floor(x / colWidth)));
    },
    [colCount, colWidth]
  );

  const beginCreate = useCallback(
    (target: RoomPlanRowTarget, clientX: number) => {
      if (!enabled) return;
      const col = colFromClientX(clientX);
      movedRef.current = false;
      setDrag({ kind: "create", ...target, startCol: col, endCol: col });
    },
    [colFromClientX, enabled]
  );

  const beginMove = useCallback(
    (
      payload: { bookingId: string; roomTypeId: string; originRowKey: string; originRoomId: string | null; startCol: number; cols: number },
      clientX: number
    ) => {
      if (!enabled) return;
      grabColRef.current = colFromClientX(clientX);
      movedRef.current = false;
      setDrag({
        kind: "move",
        ...payload,
        deltaCols: 0,
        target: { rowKey: payload.originRowKey, roomId: payload.originRoomId, roomTypeId: payload.roomTypeId },
        valid: true,
      });
    },
    [colFromClientX, enabled]
  );

  useEffect(() => {
    if (!drag) return;

    const handleMove = (event: PointerEvent) => {
      movedRef.current = true;
      const col = colFromClientX(event.clientX);
      const current = dragRef.current;
      if (!current) return;
      if (current.kind === "create") {
        setDrag({ ...current, endCol: col });
        return;
      }
      const target = readRowTarget(event.clientX, event.clientY) || current.target;
      const deltaCols = col - grabColRef.current;
      const candidate = { ...current, deltaCols, target };
      const { valid: _ignored, ...rest } = candidate;
      setDrag({ ...candidate, valid: validateMove(rest) });
    };

    const handleUp = () => {
      const current = dragRef.current;
      setDrag(null);
      if (!current) return;
      if (current.kind === "create") {
        if (!movedRef.current) return;
        onCreateCommit(current);
        return;
      }
      if (!movedRef.current) return;
      if (current.deltaCols === 0 && current.target.rowKey === current.originRowKey) return;
      if (!current.valid) return;
      onMoveCommit(current);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [drag, colFromClientX, onCreateCommit, onMoveCommit, validateMove]);

  return { drag, bodyRef, beginCreate, beginMove, colFromClientX };
}
