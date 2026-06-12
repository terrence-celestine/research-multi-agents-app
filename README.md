# Multi-Agent Content Creator (Gemini MCP Server)

An advanced Model Context Protocol (MCP) server that implements a collaborative, sequential three-agent pipeline powered by Google Gemini (gemini-2.5-flash). This server automates the generation of rapid, editorially polished technical content and compiles it into professional formats (TXT, DOCX, and PDF).

---

## How It Works: The Three-Agent Triad Pipeline

Rather than relying on a single prompt to generate and refine content, this project utilizes a sequential multi-agent pipeline where specialized agents collaborate to produce superior technical articles, documentation, or summaries:

```
[User Request] 
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ Agent 1: Precise Technical Architect (Outline)          │
│ - Creates a micro-outline targeting the specific audience│
│ - Keeps it high-level, structured, and under 50 words   │
└─────────────────────────┬───────────────────────────────┘
                          │ (Outline)
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Agent 2: Concise Technical Writer (Prose Draft)         │
│ - Expands the outline into exactly 3 structured paragraphs│
│ - Focuses on technical accuracy and depth (~100 words/para)│
└─────────────────────────┬───────────────────────────────┘
                          │ (Raw Draft)
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Agent 3: Strict Copy Editor (Editorial Polish)          │
│ - Refines syntax rhythm, active voice, and phrasing     │
│ - Delivers the final polished, publication-ready copy   │
└─────────────────────────┬───────────────────────────────┘
                          │ (Polished Content)
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Artifact Compiler                                       │
│ - Compiles output into requested format (TXT, DOCX, PDF) │
│ - Saves to build/exports/ directory                     │
└─────────────────────────────────────────────────────────┘
```

---

## Features

- **Sequential Multi-Agent Pipeline**: Leverages specialized system instructions for three distinct roles (Architect, Writer, Editor) to produce high-quality prose.
- **Rich Document Compilation**:
  - **PDF**: Generates beautifully formatted PDFs with professional margins, custom colors (#1A365D headers, #2D3748 body), and justified text alignment using pdfkit.
  - **DOCX**: Generates structured Word documents with styled headings and paragraphs using docx.
  - **TXT**: Generates clean, raw text files.
- **Model Context Protocol (MCP) Compliant**: Exposes its capabilities as an MCP tool, allowing seamless integration with MCP clients like Cursor, Claude Desktop, and more.
- **Powered by Google Gemini**: Uses the official @google/genai SDK and the fast, highly capable gemini-2.5-flash model.

---

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Language**: TypeScript
- **AI SDK**: @google/genai
- **MCP SDK**: @modelcontextprotocol/sdk
- **Document Generators**: pdfkit (PDF), docx (Word), fs (TXT)
- **Validation**: zod

---

## Installation and Setup

### 1. Prerequisites
- Node.js (v16+ recommended)
- A Google Gemini API Key. You can get one from Google AI Studio.

### 2. Clone and Install Dependencies
```bash
git clone https://github.com/terrence-celestine/research-multi-agents-app.git
cd research-multi-agents-app
npm install
```

### 3. Build the Project
Compile the TypeScript code to JavaScript:
```bash
npm run build
```

---

## MCP Configuration

To use this server in your favorite MCP client, configure it with the GEMINI_API_KEY environment variable.

### 1. Cursor Integration
1. Open Cursor and navigate to Settings -> Features -> MCP.
2. Click "+ Add New MCP Server".
3. Configure the settings:
   - **Name**: multi-agent-content-creator
   - **Type**: command
   - **Command**:
     ```bash
     node "C:/path/to/research-multi-agents-app/build/index.js"
     ```
     (Replace C:/path/to/ with the absolute path to your project directory. Ensure you use double quotes if the path contains spaces.)
4. Add the environment variable:
   - **Key**: GEMINI_API_KEY
   - **Value**: your-actual-gemini-api-key

### 2. Claude Desktop Integration
Add the following configuration to your claude_desktop_config.json (usually located at %APPDATA%\Claude\claude_desktop_config.json on Windows or ~/Library/Application Support/Claude/claude_desktop_config.json on macOS):

```json
{
  "mcpServers": {
    "multi-agent-content-creator": {
      "command": "node",
      "args": [
        "C:/path/to/research-multi-agents-app/build/index.js"
      ],
      "env": {
        "GEMINI_API_KEY": "your-actual-gemini-api-key"
      }
    }
  }
}
```

---

## Tool Reference

The server registers a single powerful tool:

### create_content_pipeline
Triggers the full sequential three-agent pipeline to generate and export polished technical content.

#### Input Arguments
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `topic` | `string` | Yes | The core subject matter or focus theme (e.g., "Model Context Protocol", "Quantum Computing"). |
| `audience` | `string` | Yes | The targeted reading audience (e.g., "Software Engineers", "Business Executives"). |
| `format` | `string` | Yes | The output file format. Must be one of: "txt", "docx", "pdf". |
| `fileName` | `string` | Yes | The name of the output file (without extension). |

#### Output
On success, the tool returns a JSON object containing:
- `status`: "success"
- `provider`: "Google Gemini (Full 3-Agent Triad Pipeline)"
- `artifacts`:
  - `phase_1_architecture_outline`: The brief outline generated by Agent 1.
  - `phase_2_raw_unpolished_draft`: The 3-paragraph draft generated by Agent 2.
  - `phase_3_final_polished_output`: The final polished text generated by Agent 3.
- `saved_location`: The absolute path where the compiled document was saved.
- `file_format`: The requested format.

All generated documents are saved in the build/exports/ directory of the project.

---

## Development

To run the server in development mode with hot-reloading (without manual compilation):

```bash
npx tsx src/index.ts
```

*Note: Since the MCP server communicates over stdio, running it directly in the terminal will start the server and wait for JSON-RPC input. To debug, you can inspect stderr logs or use the MCP Inspector.*

---

## License

This project is licensed under the ISC License.
