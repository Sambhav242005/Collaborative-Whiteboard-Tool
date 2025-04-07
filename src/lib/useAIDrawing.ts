"use client";

import { DrawingInstruction } from "@/schema/drawingSchema";
import { useState } from "react";

export const useAIDrawing = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getSelectionAsBase64(
    ctx: CanvasRenderingContext2D,
    selectedArea: { x: number; y: number; width: number; height: number }
  ): string {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = selectedArea.width;
    tempCanvas.height = selectedArea.height;
  
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) throw new Error("Could not get 2D context");
  
    // 🟡 Step 1: Fill background with white (or any color)
    tempCtx.fillStyle = "#ffffff"; // You can change this
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  
    // 🟢 Step 2: Draw the selected image data on top
    const imageData = ctx.getImageData(
      selectedArea.x,
      selectedArea.y,
      selectedArea.width,
      selectedArea.height
    );
    tempCtx.putImageData(imageData, 0, 0);
  
    // 🔵 Step 3: Export the canvas to base64
    return tempCanvas.toDataURL("image/jpeg");
  }
  

  const generateDrawing = async (
    prompt: string,
    ctx?: CanvasRenderingContext2D,
    selectedArea?: { x: number; y: number; width: number; height: number }
  ): Promise<DrawingInstruction[] | null> => {
    setLoading(true);
    setError(null);

    try {
      let base64Image: string | undefined;

      if (ctx && selectedArea) {
        try {
          base64Image = getSelectionAsBase64(ctx, selectedArea);
        } catch (e) {
          console.warn("Failed to convert selection to base64:", e);
        }
      }

      const res = await fetch("/api/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          image: base64Image, // may be undefined
        }),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();

      if (!data?.instructions || !Array.isArray(data.instructions)) {
        throw new Error("No valid instructions were returned.");
      }

      if (ctx) {
        drawFromJSON(ctx, data.instructions);
      }

      return data.instructions as DrawingInstruction[];
    } catch (err: any) {
      console.error("Error in generateDrawing:", err);
      setError(err.message || "Unknown error occurred.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const drawFromJSON = (
    ctx: CanvasRenderingContext2D,
    instructions: DrawingInstruction[]
  ) => {
    instructions.forEach((item) => {
      switch (item.type) {
        case "rect":
          ctx.fillStyle = item.fill || "black";
          ctx.fillRect(item.x || 0, item.y || 0, item.width || 0, item.height || 0);
          break;
        case "circle":
          ctx.fillStyle = item.fill || "black";
          ctx.beginPath();
          ctx.arc(item.x || 0, item.y || 0, item.radius || 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "line":
          ctx.strokeStyle = item.stroke || "black";
          ctx.lineWidth = item.lineWidth || 1;
          ctx.beginPath();
          ctx.moveTo(item.x1 || 0, item.y1 || 0);
          ctx.lineTo(item.x2 || 0, item.y2 || 0);
          ctx.stroke();
          break;
        default:
          console.warn("Unknown shape:", item);
      }
    });
  };

  return { generateDrawing, loading, error };
};
