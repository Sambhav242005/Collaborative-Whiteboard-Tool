import { NextRequest, NextResponse } from "next/server";
import { DrawingResponseSchema } from "@/schema/drawingSchema";
import { zodToJsonSchema } from "zod-to-json-schema";
import fs from "fs";

// --- Handler ---
export const POST = async (req: NextRequest) => {
  const body = await req.json();
  const prompt = body?.prompt || "Draw a house with a tree next to it.";
  const image = body?.image;

  // Log request to local file for debugging
  fs.writeFileSync("./saveFromJSON.json", JSON.stringify(body, null, 2));

  // Validate image format
  if (image && !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
  }

  // Generate system prompt
  const systemPrompt = `
    You are a drawing assistant. Based on a scene description, generate a JSON object like:
    { "instructions": [ ... ] }

    Each object in "instructions" should include:
    - "type": one of "rect", "circle", "line", "text", or "polygon"
    - "id": a unique string for each shape
    - And shape-specific properties (x/y/width/radius/etc)

    Keep all coordinates between 0 and 500.
    Respond only with a valid JSON object — no explanation or commentary.
    
    Scene: ${prompt}
  `;

  try {
    // 🔧 Prepare JSON schema from Zod
    const fullSchema = zodToJsonSchema(DrawingResponseSchema, "DrawingInstructions");
    const rawSchema = fullSchema.definitions?.DrawingInstructions ?? fullSchema;

    // 🔥 Make request to OpenAI (using fetch, not SDK)
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              ...(image
                ? [
                    {
                      type: "image_url",
                      image_url: {
                        url: image,
                        detail: "auto",
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "DrawingInstructions",
            description: "A JSON object containing canvas drawing instructions.",
            schema: rawSchema,
          },
        },
        
      }),
    });

    const result = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error("OpenAI error:", result);
      return NextResponse.json({ error: result.error }, { status: openaiRes.status });
    }

    const message = result.choices[0]?.message?.content || "{}";

    // Validate response against Zod
    const validated = DrawingResponseSchema.parse(JSON.parse(message));
    return NextResponse.json(validated);
  } catch (err: any) {
    console.error("OpenAI drawing error:", err);
    return NextResponse.json(
      { error: "Invalid response", detail: err.message },
      { status: 500 }
    );
  }
};
