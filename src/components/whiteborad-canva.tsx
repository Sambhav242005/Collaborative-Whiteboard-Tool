"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useAIDrawing } from "@/lib/useAIDrawing";
import { useWindowSize } from "@/lib/useWindowSize";
import { Textarea } from "./ui/textarea";
import { Slider } from "./ui/slider";
import { Button } from "./ui/button";
import { DrawingAction, DrawingMode } from "@/lib/types";
import { DrawingInstruction } from "@/schema/drawingSchema";
import {
  downloadCanvasAsImage,
  drawFromJSON,
  getBoundingBox,
  getCanvasBase64,
  getFreehandBoundingBox,
  getMousePos,
  isPointInBox,
  reDrawPreviousData,
} from "@/lib/healper";
import { Switch } from "./ui/switch";

const safe = (n: number | undefined) => n ?? 0;

export default function WhiteboardCanvas() {
  // Basic hooks
  const { generateDrawing, loading, error } = useAIDrawing();
  const { width, height } = useWindowSize();

  // Canvas references
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  // High-level "mode": "draw" or "select"
  const [mode, setMode] = useState<DrawingMode>("draw");

  // Track freehand "drawing" state
  const [drawingEnabled, setDrawingEnabled] = useState(true);
  const [drawing, setDrawing] = useState(false);

  // For AI logic
  const [prompt, setPrompt] = useState("draw a house with a tree");
  const [pendingAIInstructions, setPendingAIInstructions] = useState<
    DrawingInstruction[] | null
  >(null);
  const [previewPosition, setPreviewPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [previewVisible, setPreviewVisible] = useState(true);

  // Our main store of actions (both freehand strokes & AI shapes)
  const [drawingAction, setDrawingAction] = useState<DrawingAction[]>([]);

  // Style for freehand drawing
  const [currentColor, setCurrentColor] = useState("black");
  const [lineWidth, setLineWidth] = useState(3);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>(
    []
  );
  const [currentStyle, setCurrentStyle] = useState({
    color: "black",
    lineWidth: 3,
  });

  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Selection box logic
  const [selectStart, setSelectStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectEnd, setSelectEnd] = useState<{ x: number; y: number } | null>(
    null
  );
  const [isSelecting, setIsSelecting] = useState(false);

  /**
   * Init canvas size & context on load or window resize.
   */
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      contextRef.current = ctx;
    }
  }, [width, height]);

  /**
   * Animate: Re-draw everything (freehand shapes, AI shapes, selection box)
   */
  const animate = useCallback(() => {
    const ctx = contextRef.current;
    if (!ctx) return;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    reDrawPreviousData(ctx, drawingAction);

    if (previewPosition && pendingAIInstructions) {
      const { minX, minY, maxX, maxY } = getBoundingBox(pendingAIInstructions);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const offsetX = previewPosition.x - centerX;
      const offsetY = previewPosition.y - centerY;

      const shifted = pendingAIInstructions.map((inst) => {
        const shiftedInst = { ...inst };
        if ("x" in shiftedInst) shiftedInst.x = safe(shiftedInst.x) + offsetX;
        if ("y" in shiftedInst) shiftedInst.y = safe(shiftedInst.y) + offsetY;
        if ("x1" in shiftedInst)
          shiftedInst.x1 = safe(shiftedInst.x1) + offsetX;
        if ("y1" in shiftedInst)
          shiftedInst.y1 = safe(shiftedInst.y1) + offsetY;
        if ("x2" in shiftedInst)
          shiftedInst.x2 = safe(shiftedInst.x2) + offsetX;
        if ("y2" in shiftedInst)
          shiftedInst.y2 = safe(shiftedInst.y2) + offsetY;

        if ("points" in shiftedInst && Array.isArray(shiftedInst.points)) {
          shiftedInst.points = shiftedInst.points.map((p) => ({
            x: safe(p.x) + offsetX,
            y: safe(p.y) + offsetY,
          }));
        }

        return shiftedInst;
      });

      drawFromJSON(ctx, shifted);

      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;
      const boxX = previewPosition.x - boxWidth / 2;
      const boxY = previewPosition.y - boxHeight / 2;

      if (previewVisible) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
        ctx.restore();
      }
    }

    if (selectionBox) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "blue";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        selectionBox.x,
        selectionBox.y,
        selectionBox.width,
        selectionBox.height
      );
      ctx.restore();
    }

    // Draw highlight for selected items
    drawingAction.forEach((item) => {
      if ("selected" in item && item.selected) {
        const box =
          item.type === "freehand"
            ? getFreehandBoundingBox(item.path)
            : getBoundingBox([item]);

        ctx.save();
        ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(
          box.minX,
          box.minY,
          box.maxX - box.minX,
          box.maxY - box.minY
        );
        ctx.restore();
      }
    });
  }, [
    drawingAction,
    previewPosition,
    pendingAIInstructions,
    previewVisible,
    selectionBox,
  ]);

  /**
   * RequestAnimationFrame loop for continuous re-drawing
   */
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      animate();
      frameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frameId);
  }, [animate]);

  /**
   * Mouse event: handle MOUSE DOWN
   */
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // If user has pending AI instructions, do nothing special.
    if (pendingAIInstructions) return;

    // If draw mode, start freehand drawing
    if (mode === "draw") {
      startDrawing(e);
    }
    // If selection mode, start the selection box
    else if (mode === "select") {
      const pos = getMousePos(e, canvasRef);
      setSelectStart(pos);
      setSelectEnd(pos);
      setIsSelecting(true);
    }
  };

  /**
   * Mouse event: handle MOUSE MOVE
   */
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // If AI instructions are pending, that's the "preview" logic
    if (pendingAIInstructions) {
      const pos = getMousePos(e, canvasRef);
      setPreviewPosition(pos);
      // Turn off freehand drawing if it's on
      setDrawing(false);
      return;
    }

    // If user is actively dragging a selection box
    if (mode === "select" && isSelecting && selectStart) {
      const pos = getMousePos(e, canvasRef);
      setSelectEnd(pos);

      // Keep track of the selection box in state so we can draw it
      setSelectionBox({
        x: Math.min(selectStart.x, pos.x),
        y: Math.min(selectStart.y, pos.y),
        width: Math.abs(selectStart.x - pos.x),
        height: Math.abs(selectStart.y - pos.y),
      });
    }

    // If in draw mode and actively drawing, keep drawing
    else if (mode === "draw") {
      draw(e);
    }
  };

  /**
   * Mouse event: handle MOUSE UP
   */
  const handleMouseUp = () => {
    if (mode === "select" && isSelecting && selectStart && selectEnd) {
      applySelectionBox(selectStart, selectEnd);
      setSelectStart(null);
      setSelectEnd(null);
      setIsSelecting(false);
    }
    // If in draw mode, end freehand
    else if (mode === "draw") {
      endDrawing();
    }
  };

  /**
   * Helper: Start freehand drawing
   */
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingEnabled || !contextRef.current) return;

    const pos = getMousePos(e, canvasRef);
    contextRef.current.beginPath();
    contextRef.current.moveTo(pos.x, pos.y);
    setDrawing(true);
    setCurrentPath([{ x: pos.x, y: pos.y }]);
  };

  /**
   * Helper: Continue freehand drawing
   */
  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !contextRef.current) return;

    const pos = getMousePos(e, canvasRef);
    const newPath = [...currentPath, pos];
    setCurrentPath(newPath);

    if (newPath.length > 1) {
      const prev = newPath[newPath.length - 2];
      contextRef.current.beginPath();
      contextRef.current.moveTo(prev.x, prev.y);
      contextRef.current.lineTo(pos.x, pos.y);
      contextRef.current.strokeStyle = currentStyle.color;
      contextRef.current.lineWidth = currentStyle.lineWidth;
      contextRef.current.stroke();
    }
  };

  /**
   * Helper: End freehand drawing
   */
  const endDrawing = () => {
    setDrawing(false);
    contextRef.current?.closePath();

    if (currentPath.length > 0) {
      setDrawingAction((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "freehand",
          path: currentPath,
          style: currentStyle,
          selected: false,
        },
      ]);
    }
    setCurrentPath([]);
  };

  /**
   * Helper: Apply selection box to items
   */
  const applySelectionBox = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    setDrawingAction((prev) =>
      prev.map((item) => {
        const box =
          item.type === "freehand"
            ? getFreehandBoundingBox(item.path)
            : getBoundingBox([item]);

        const isInside =
          box.minX >= minX &&
          box.maxX <= maxX &&
          box.minY >= minY &&
          box.maxY <= maxY;

        return {
          ...item,
          selected: isInside,
        };
      })
    );
  };

  /**
   * On canvas click (for placing AI shapes or single-click selection).
   */
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!contextRef.current) return;

    // If we have pending AI instructions, finalize them
    if (pendingAIInstructions) {
      placeAIInstructions(e);
    }
    // If we're in select mode, interpret a single click as shape selection
    else if (mode === "select") {
      singleClickSelection(e);
    }
  };

  /**
   * For single-click selection (not the bounding box).
   */
  const singleClickSelection = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const ctx = contextRef.current;
    if (!ctx) return;

    const pos = getMousePos(e, canvasRef);

    let foundId: string | null = null;
    for (let i = drawingAction.length - 1; i >= 0; i--) {
      const item = drawingAction[i];
      if (item.type === "freehand") {
        const { minX, minY, maxX, maxY } = getFreehandBoundingBox(item.path);
        if (isPointInBox(pos.x, pos.y, { minX, minY, maxX, maxY })) {
          foundId = item.id;
          break;
        }
      } else {
        const { minX, minY, maxX, maxY } = getBoundingBox([item]);
        if (isPointInBox(pos.x, pos.y, { minX, minY, maxX, maxY })) {
          foundId = item.id;
          break;
        }
      }
    }

    if (foundId) {
      setDrawingAction((prev) =>
        prev.map((action) =>
          action.id === foundId
            ? { ...action, selected: true }
            : { ...action, selected: false }
        )
      );
    } else {
      setDrawingAction((prev) =>
        prev.map((action) => ({ ...action, selected: false }))
      );
    }
  };

  /**
   * Shift AI instructions from preview to permanent placement
   */
  const placeAIInstructions = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!pendingAIInstructions || !contextRef.current) return;

    const pos = getMousePos(e, canvasRef);
    const { minX, minY, maxX, maxY } = getBoundingBox(pendingAIInstructions);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const offsetX = pos.x - centerX;
    const offsetY = pos.y - centerY;

    const shifted = pendingAIInstructions.map((inst) => {
      const s = { ...inst };
      if ("x" in s) s.x = safe(s.x) + offsetX;
      if ("y" in s) s.y = safe(s.y) + offsetY;
      if ("x1" in s) s.x1 = safe(s.x1) + offsetX;
      if ("y1" in s) s.y1 = safe(s.y1) + offsetY;
      if ("x2" in s) s.x2 = safe(s.x2) + offsetX;
      if ("y2" in s) s.y2 = safe(s.y2) + offsetY;

      if ("points" in s && Array.isArray(s.points)) {
        s.points = s.points.map((p) => ({
          x: safe(p.x) + offsetX,
          y: safe(p.y) + offsetY,
        }));
      }
      if (!s.id) s.id = crypto.randomUUID();
      s.selected = false;
      return s;
    });

    setDrawingAction((prev) => {
      const updated = [...prev, ...shifted];
      contextRef.current?.clearRect(
        0,
        0,
        contextRef.current.canvas.width,
        contextRef.current.canvas.height
      );
      if (contextRef.current) {
        reDrawPreviousData(contextRef.current, updated);
      }
      return updated;
    });

    // Clean up
    setPendingAIInstructions(null);
    setPreviewPosition(null);
    setPreviewVisible(false);
    setDrawingEnabled(true);
  };

  /**
   * AI: Generate instructions from prompt
   */
  const handleAIDrawing = async () => {
    // Optionally convert your canvas to base64
    // or get a base64 string from file input
    const imageBase64 = canvasRef.current
      ? canvasRef.current.toDataURL("image/png")
      : undefined;

    // Get a 2D context for immediate drawing (optional)
    const ctx = canvasRef.current?.getContext("2d") || undefined;

    let instructions;

    if (selectionBox) {
      instructions = await generateDrawing(prompt, ctx, selectionBox);
    }else{
      instructions = await generateDrawing(prompt);

    }

    
    // If needed, store or manipulate instructions here
    console.log("AI instructions:", instructions);


    if (instructions) {
      setPendingAIInstructions(instructions);
      setPreviewVisible(true);
    }
    setDrawingEnabled(false);
  };
  

  /**
   * See how AI drawing looks at (0,0) just for a quick test
   */
  const previewAIDrawing = () => {
    if (!contextRef.current || !pendingAIInstructions) return;
    const ctx = contextRef.current;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    reDrawPreviousData(ctx, drawingAction);
    drawFromJSON(ctx, pendingAIInstructions);
  };

  /**
   * Undo last action
   */
  const undoDrawing = () => {
    const newActions = [...drawingAction];
    newActions.pop();
    setDrawingAction(newActions);

    // Clear & re-draw
    const ctx = contextRef.current;
    if (ctx) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      reDrawPreviousData(ctx, newActions);
    }

    setPendingAIInstructions(null);
    setPreviewPosition(null);
    setPreviewVisible(false);
  };

  /**
   * Delete selected items
   */
  const handleDeleteSelected = () => {
    setDrawingAction((prev) =>
      prev.filter((item) => "selected" in item && !item.selected)
    );
  };

  /**
   * Clear entire canvas
   */
  const clearDrawing = () => {
    setDrawingAction([]);
    setCurrentPath([]);
    setPendingAIInstructions(null);
    setPreviewPosition(null);
    setPreviewVisible(false);
    setDrawingEnabled(true);

    const ctx = contextRef.current;
    if (ctx) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  };

  return (
    <div className="p-4">
      {pendingAIInstructions && (
        <p className="text-blue-600 font-medium">
          Click on the canvas to place the AI drawing
        </p>
      )}

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-black"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleCanvasClick}
      />

      <Textarea
        className="my-4"
        placeholder="Enter AI prompt..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <div className="flex gap-4 flex-wrap items-center">
        {/* Color swatches */}
        <div className="flex gap-2">
          {["red", "blue", "green", "orange", "black"].map((color) => (
            <div
              key={color}
              className={`w-6 h-6 rounded-full cursor-pointer border-2 ${
                currentColor === color
                  ? "border-gray-800 scale-110"
                  : "border-transparent"
              }`}
              style={{ backgroundColor: color }}
              onClick={() => {
                setCurrentColor(color);
                setCurrentStyle((s) => ({ ...s, color }));
              }}
            />
          ))}
        </div>

        {/* Line width slider */}
        <div className="w-32">
          <Slider
            className="border"
            defaultValue={[lineWidth]}
            min={1}
            max={10}
            step={1}
            onValueChange={([val]) => {
              setLineWidth(val);
              setCurrentStyle((s) => ({ ...s, lineWidth: val }));
            }}
          />
        </div>

        {/* AI draw */}
        <Button
          onClick={handleAIDrawing}
          disabled={loading}
          className="bg-green-600 hover:bg-green-700"
        >
          {loading ? "Generating..." : "AI Draw"}
        </Button>

        {/* Undo */}
        <Button onClick={undoDrawing} variant="outline" className="border">
          Undo
        </Button>

        {/* Preview AI */}
        <Button
          onClick={previewAIDrawing}
          disabled={!pendingAIInstructions}
          variant="secondary"
        >
          Preview
        </Button>

        {/* Clear canvas */}
        <Button onClick={clearDrawing} variant="destructive">
          Clear
        </Button>

        <div className="p-2">
          <Switch
            checked={selectionEnabled}
            onCheckedChange={(checked) => {
              setSelectionEnabled(checked);
              setMode(checked ? "select" : "draw");
              setSelectionBox(null);
            }}
          />
          <span className="ml-2">
            {selectionEnabled ? "Selection Enabled" : "Selection Disabled"}
          </span>
        </div>

        {/* Delete selected */}
        <Button onClick={handleDeleteSelected} variant="outline">
          Delete Selected
        </Button>

        {/* Download */}
        <Button
          onClick={() => downloadCanvasAsImage(canvasRef)}
          variant="outline"
        >
          Download as Image
        </Button>
      </div>

      {error && <p className="text-red-500 mt-2">Error: {error}</p>}
    </div>
  );
}
