import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import { DrawingResponseSchema } from "@/schema/drawingSchema";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ChatCompletionContentPart } from "openai/resources/chat/completions";
import type { JsonSchema7ObjectType } from "zod-to-json-schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const POST = async (req: NextRequest) => {
  const body = await req.json();
  const prompt = body?.prompt || "Draw a house with a tree next to it.";
  const image = body?.image;

  const systemPrompt = `
  You are a drawing assistant. Based on a scene description, generate a JSON object like:
  { "instructions": [ ... ] }
  
  To handle complex scenes:
  - Break the drawing into smaller logical components (e.g. "house body", "roof", "window", "sun", "tree trunk", "leaves", etc.)
  - Create one instruction per visual element.
  
  Each object in "instructions" should include:
  - "type": one of "rect", "circle", "line", "text", or "polygon"
  - "id": a unique string for each shape
  - Depending on the type, include:
    - For "rect": x, y, width, height, optional fill
    - For "circle": x, y, radius, optional fill
    - For "line": x1, y1, x2, y2, optional stroke, lineWidth
    - For "text": x, y, text, optional fill, font
    - For "polygon": points: [{ x, y }...], optional fill/stroke
  
  Keep all coordinates between 0 and 500.
  Ensure visual elements are spaced and sized appropriately.
  Respond only with a valid JSON object — no explanation or commentary.
  
  Scene: ${prompt}
  `;
  

  try {
    // 🔥 Extract proper root schema from zod-to-json-schema
    const fullSchema = zodToJsonSchema(
      DrawingResponseSchema,
      "DrawingInstructions"
    );
    const rawSchema = fullSchema.definitions?.DrawingInstructions ?? fullSchema;

    if ((rawSchema as JsonSchema7ObjectType).type !== "object") {
      throw new Error("Invalid JSON schema: root type must be 'object'");
    }

    const openAISchema = {
      name: "DrawingInstructions",
      description: "A JSON object containing canvas drawing instructions.",
      schema: rawSchema,
    };

    if (image && !image.startsWith("data:image/")) {

      return NextResponse.json(
        { error: "Invalid image format" },
        { status: 400 }
      );
    }
    const contentParts: ChatCompletionContentPart[] = [
      {
        type: "text",
        text: prompt || "What can you draw or describe from this image?",
      },
    ];

    if (image) {
      contentParts.push({
        type: "image_url",
        image_url: {
          url: image,
        },
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: contentParts,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: openAISchema,
      } as any,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const validated = DrawingResponseSchema.parse(JSON.parse(content));

    return NextResponse.json(validated);
  } catch (err: any) {
    console.error("OpenAI drawing error:", err);
    return NextResponse.json(
      { error: "Invalid response", detail: err.message },
      { status: 500 }
    );
  }
};
