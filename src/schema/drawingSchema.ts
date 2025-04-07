// lib/drawingSchema.ts
import { z } from "zod";

export const DrawingInstructionSchema = z.object({
  type: z.enum(["rect", "circle", "line", "text", "polygon", "erase"]), // ✅ include "erase"
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  radius: z.number().optional(),
  x1: z.number().optional(),
  y1: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  lineWidth: z.number().optional(),
  text: z.string().optional(),
  font: z.string().optional(),
  points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  id:z.string(),
  selected:z.boolean().optional()
});

export const DrawingResponseSchema = z.object({
  instructions: z.array(DrawingInstructionSchema),
});

// Inferred TypeScript types
export type DrawingInstruction = z.infer<typeof DrawingInstructionSchema>;
export type DrawingResponse = z.infer<typeof DrawingResponseSchema>;
