// helper.ts

import { DrawingInstruction } from "@/schema/drawingSchema";

/**
 * Safely handle numbers that might be undefined, defaulting to 0.
 */
function safe(n: number | undefined): number {
  return n ?? 0;
}

/**
 * Get mouse coordinates relative to the canvas size,
 * adjusting for different device pixel ratios or scaled canvases.
 */
export function getMousePos(
  e: React.MouseEvent<HTMLCanvasElement, MouseEvent>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const canvas = canvasRef.current;
  if (!canvas) {
    return { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

/**
 * Download the canvas content as a PNG image.
 */
export function downloadCanvasAsImage(canvasRef: any) {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = "canvas-drawing.png";
  link.click();
}

/**
 * Determine the bounding box (min/max x/y) of a set of drawing instructions.
 */
export function getBoundingBox(instructions: DrawingInstruction[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const inst of instructions) {
    // Single points
    if ("x" in inst && "y" in inst) {
      minX = Math.min(minX, safe(inst.x));
      minY = Math.min(minY, safe(inst.y));
      maxX = Math.max(maxX, safe(inst.x));
      maxY = Math.max(maxY, safe(inst.y));
    }

    // Lines (x1,y1 -> x2,y2)
    if ("x1" in inst && "y1" in inst) {
      minX = Math.min(minX, safe(inst.x1));
      minY = Math.min(minY, safe(inst.y1));
      maxX = Math.max(maxX, safe(inst.x1));
      maxY = Math.max(maxY, safe(inst.y1));
    }
    if ("x2" in inst && "y2" in inst) {
      minX = Math.min(minX, safe(inst.x2));
      minY = Math.min(minY, safe(inst.y2));
      maxX = Math.max(maxX, safe(inst.x2));
      maxY = Math.max(maxY, safe(inst.y2));
    }

    // Polygons or freehand points
    if ("points" in inst && Array.isArray(inst.points)) {
      for (const p of inst.points) {
        minX = Math.min(minX, safe(p.x));
        minY = Math.min(minY, safe(p.y));
        maxX = Math.max(maxX, safe(p.x));
        maxY = Math.max(maxY, safe(p.y));
      }
    }
  }

  return { minX, minY, maxX, maxY };
}

export function isPointInBox(
  x: number,
  y: number,
  box: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
}

/**
 * Draw an array of instructions onto the 2D canvas.
 * This function handles rectangles, circles, lines, text, and polygons.
 */
export function drawFromJSON(
  ctx: CanvasRenderingContext2D,
  instructions: DrawingInstruction[]
) {
  for (const item of instructions) {
    switch (item.type) {
      case "rect":
        ctx.fillStyle = item.fill || "black";
        ctx.fillRect(
          safe(item.x),
          safe(item.y),
          safe(item.width),
          safe(item.height)
        );
        break;

      case "circle":
        ctx.fillStyle = item.fill || "black";
        ctx.beginPath();
        ctx.arc(safe(item.x), safe(item.y), safe(item.radius), 0, Math.PI * 2);
        ctx.fill();
        break;

      case "line":
        ctx.strokeStyle = item.stroke || "black";
        ctx.lineWidth = safe(item.lineWidth);
        ctx.beginPath();
        ctx.moveTo(safe(item.x1), safe(item.y1));
        ctx.lineTo(safe(item.x2), safe(item.y2));
        ctx.stroke();
        break;

      case "text":
        ctx.fillStyle = item.fill || "black";
        ctx.font = item.font || "16px sans-serif";
        ctx.fillText(item.text || "", safe(item.x), safe(item.y));
        break;

      case "polygon":
        if (item.points && item.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(safe(item.points[0].x), safe(item.points[0].y));
          for (let i = 1; i < item.points.length; i++) {
            ctx.lineTo(safe(item.points[i].x), safe(item.points[i].y));
          }
          ctx.closePath();
          if (item.fill) {
            ctx.fillStyle = item.fill;
            ctx.fill();
          }
          if (item.stroke) {
            ctx.strokeStyle = item.stroke;
            ctx.lineWidth = safe(item.lineWidth);
            ctx.stroke();
          }
        }
        break;

      default:
        // Handle unknown instruction types if necessary
        break;
    }
  }
}

export function getFreehandBoundingBox(path: { x: number; y: number }[]) {
  if (!path.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = path[0].x;
  let minY = path[0].y;
  let maxX = path[0].x;
  let maxY = path[0].y;

  for (const p of path) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Re-draw all previous data (both freehand & AI instructions).
 * Clears the canvas first, then iterates through each stored action.
 */
export function reDrawPreviousData(
  ctx: CanvasRenderingContext2D,
  drawingAction: any[] // refine type to your union if you have it
) {
  // Clear the full canvas first
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const action of drawingAction) {
    // 1) DRAW THE SHAPE
    if (action.type === "freehand") {
      ctx.beginPath();
      ctx.strokeStyle = action.style.color;
      ctx.lineWidth = action.style.lineWidth;

      const [firstPoint, ...rest] = action.path;
      ctx.moveTo(safe(firstPoint?.x), safe(firstPoint?.y));
      for (const p of rest) {
        ctx.lineTo(safe(p.x), safe(p.y));
      }
      ctx.stroke();
      ctx.closePath();
    } else {
      // Otherwise treat this as a standard DrawingInstruction
      drawFromJSON(ctx, [action]);
    }

    // 2) IF SELECTED, DRAW A DASHED BOUNDING BOX
    if (action.selected) {
      let box;
      if (action.type === "freehand") {
        box = getFreehandBoundingBox(action.path);
      } else {
        box = getBoundingBox([action]);
      }
      const { minX, minY, maxX, maxY } = box;

      ctx.save();
      ctx.setLineDash([5, 3]); // dashed line
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1; // or whatever looks good
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.restore();
    }
  }
}

export function getCanvasBase64(canvasRef:any) {
  if (!canvasRef.current) return null;
  // Default: image/png; adjust format/quality if needed
  return canvasRef.current.toDataURL("image/png");
}
