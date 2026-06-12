import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenAI } from "@google/genai"; 
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

// Add maxTokens as a third parameter with a safe default value of 400
async function askSubAgent(persona: string, prompt: string, maxTokens: number = 400): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash", 
    contents: prompt,
    config: {
      systemInstruction: persona,
      temperature: 0.7,
      maxOutputTokens: maxTokens, // Use the dynamic value here!
    }
  });

  if (response.text) return response.text;
  throw new Error("Sub-agent returned an empty response block.");
}

// Ensure local export directory exists safely
const EXPORT_DIR = path.join(__dirname, "exports");
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// --- FILE CONVERSION UTILITIES ---

async function exportAsTxt(filePath: string, title: string, content: string): Promise<void> {
  const rawText = `TITLE: ${title}\n\n${content}`;
  fs.writeFileSync(filePath, rawText, "utf8");
}

async function exportAsDocx(filePath: string, title: string, content: string): Promise<void> {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: "" }), // Spacer
        ...content.split("\n\n").map(para => new Paragraph({
          children: [new TextRun({ text: para.trim(), size: 24 })] // 12pt font
        }))
      ]
    }]
  });
  const b64string = await Packer.toBase64String(doc);
  fs.writeFileSync(filePath, Buffer.from(b64string, "base64"));
}

function exportAsPdf(filePath: string, title: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    
    doc.pipe(writeStream);
    
    // Title Layout
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#1A365D").text(title, { underline: true });
    doc.moveDown(1.5);
    
    // Body Layout
    doc.font("Helvetica").fontSize(11).fillColor("#2D3748").lineGap(4);
    doc.text(content, { align: "justify" });
    
    doc.end();
    
    writeStream.on("finish", () => resolve());
    writeStream.on("error", (err) => reject(err));
  });
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
            format: { type: "string", description: "The format of the output file."},
            fileName: {type: "string", description: "The name of the output file."}
          },
          required: ["topic", "audience", "format", "fileName"],
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

  const argsSchema = z.object({ topic: z.string(), audience: z.string(), format: z.enum(["txt", "docx", "pdf"]),
    fileName: z.string() });
  const parsed = argsSchema.safeParse(request.params.arguments);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { topic, audience,format, fileName } = parsed.data;
  const filePath = path.join(EXPORT_DIR, `${fileName}.${format}`);

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
    const copywriterPersona = "You are a concise technical writer. Summarize complex architectures into exactly 3 paragraphs based on structural guidelines. Each paragraph should be approximately 100 words long.";
    const rawDraft = await askSubAgent(
      copywriterPersona, 
      `Write exactly 3 paragraph explaining the topic for ${audience} using this outline:\n\n${outline}`,
      10000
    );

    // 🤖 AGENT 3: Strict Copy Editor (Editorial Polish)
    process.stderr.write(`✨ [AGENT 3/3] Running final editorial polish loop...\n`);
    const editorPersona = "You are a strict technical copy editor. Improve syntax rhythm, enforce active voice, and polish phrasing. Keep the final length strictly to 1";
    const polishedOutput = await askSubAgent(
      editorPersona,
      `Polished and line-edit this raw draft copy for an audience of ${audience}:\n\n${rawDraft}`
      ,10000
    );

    process.stderr.write(`✅ [MCP SYSTEM] Complete 3-agent chain executed perfectly!\n\n`);

    process.stderr.write(`💾 [EXPORT SYSTEM] Routing artifact compilation to .${format} engine...\n`);

    // 2. Invoke the matching exporter function based on the user's formatting request
    if (format === "txt") {
      await exportAsTxt(filePath, topic, polishedOutput);
    } else if (format === "docx") {
      await exportAsDocx(filePath, topic, polishedOutput);
    } else if (format === "pdf") {
      // Even though exportAsPdf returns a plain Promise instead of an async function,
      // using 'await' here perfectly forces Node to wait until the file is fully written to disk.
      await exportAsPdf(filePath, topic, polishedOutput);
    }

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
            },
            saved_location: filePath,
            file_format: format,
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