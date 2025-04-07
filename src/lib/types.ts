import type { DrawingInstruction } from "@/schema/drawingSchema";

type FreehandAction = {
  id: string;
  type: "freehand";
  path: { x: number; y: number }[];
  style: { color: string; lineWidth: number };
  selected?: boolean;
};



type EraseAction = {
  type: "erase";
  id: string;
  clearRect: { x: number; y: number; width: number; height: number };
  style: { color: string; lineWidth: number };
};

export type DrawingAction = FreehandAction | EraseAction | DrawingInstruction;

export type DrawingMode = "draw" | "erase" | "select" | "none";