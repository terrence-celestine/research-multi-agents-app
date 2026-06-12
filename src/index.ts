import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenAI } from "@google/genai"; 
import { z } from "zod";

const server = new Server(
  { name: "multi-agent-content-creator-gemini", version: "1.29.0" },
  { capabilities: { tools: {} } }
);

const rawKey = process.env.GEMINI_API_KEY;
if (!rawKey) {
  process.stderr.write("❌ [MCP DEBUG] GEMINI_API_KEY is completely UNDEFINED inside Node.\n");
  process.exit(1);
}
const apiKey = rawKey.trim();
const ai = new GoogleGenAI({ apiKey });

async function askSubAgent(persona: string, prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash", 
    contents: prompt,
    config: {
      systemInstruction: persona,
      temperature: 0.7,
      maxOutputTokens: 1000, // Kept small for ultra-fast response loops
    }
  });

  if (response.text) {
    return response.text;
  }
  throw new Error("Sub-agent returned an empty response block.");
}

// --- MCP CONTRACT 1: REGISTER TOOLS ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_content_pipeline",
        description: "Triggers a full sequential three-agent pipeline for rapid, editorially polished technical content.",
        inputSchema: {
          type: "object",
          properties: {
            topic: { type: "string", description: "The core subject matter or focus theme." },
            audience: { type: "string", description: "The targeted reading audience." },
          },
          required: ["topic", "audience"],
        },
      },
    ],
  };
});

// --- MCP CONTRACT 2: TOOL IMPLEMENTATION RUNNER ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "create_content_pipeline") {
    throw new Error(`Tool ${request.params.name} not found.`);
  }

  const argsSchema = z.object({ topic: z.string(), audience: z.string() });
  const parsed = argsSchema.safeParse(request.params.arguments);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { topic, audience } = parsed.data;
  
  try {
    // 🤖 AGENT 1: Precise Technical Architect (Outline)
    process.stderr.write(`\n🔍 [AGENT 1/3] Fetching brief blueprint for: "${topic}"...\n`);
    const strategistPersona = "You are a precise technical architect. Output a very brief, high-level markdown list of a key talking point for the topic. Keep it under 50 words total.";
    const outline = await askSubAgent(
      strategistPersona, 
      `Create a micro-outline for: "${topic}" targeting ${audience}.`
    );

    // 🤖 AGENT 2: Concise Technical Writer (Prose Draft)
    process.stderr.write(`✍️ [AGENT 2/3] Generating concise draft paragraphs...\n`);
    const copywriterPersona = "You are a concise technical writer. Summarize complex architectures into exactly one punchy paragraph based on structural guidelines.";
    const rawDraft = await askSubAgent(
      copywriterPersona, 
      `Write exactly 1 paragraph explaining the topic for ${audience} using this outline:\n\n${outline}`
    );

    // 🤖 AGENT 3: Strict Copy Editor (Editorial Polish)
    process.stderr.write(`✨ [AGENT 3/3] Running final editorial polish loop...\n`);
    const editorPersona = "You are a strict technical copy editor. Improve syntax rhythm, enforce active voice, and polish phrasing. Keep the final length strictly to 1";
    const polishedOutput = await askSubAgent(
      editorPersona,
      `Polished and line-edit this raw draft copy for an audience of ${audience}:\n\n${rawDraft}`
    );

    process.stderr.write(`✅ [MCP SYSTEM] Complete 3-agent chain executed perfectly!\n\n`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "success",
            provider: "Google Gemini (Full 3-Agent Triad Pipeline)",
            artifacts: { 
              phase_1_architecture_outline: outline,
              phase_2_raw_unpolished_draft: rawDraft,
              phase_3_final_polished_output: polishedOutput
            }
          }, null, 2),
        },
      ],
    };

  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Gemini multi-agent pipeline failure: ${error.message}` }],
      isError: true,
    };
  }
});

// --- MCP CONTRACT 3: TRANSPORT START ---
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((error) => {
  process.stderr.write(`Error launching Gemini MCP Server: ${error}\n`);
  process.exit(1);
});