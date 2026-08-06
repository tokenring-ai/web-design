import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import WebDesignService from "../WebDesignService.ts";

const name = "design_write";
const displayName = "Web Design/write design";

async function execute({ flowName, name: designName, content, encoding }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const webDesignService = agent.requireService(WebDesignService);
  const design = await webDesignService.updateDesign(flowName, designName, content, encoding);

  return {
    message: `**Web Design** Saved "${flowName}/${designName}"`,
    result: JSON.stringify({ flowName: design.flowName, name: design.name, size: design.size, updatedAt: design.updatedAt }),
  };
}

const description =
  "Create or overwrite a text file within a design flow. Files in the same flow are hosted together, so HTML can link to sibling CSS and JavaScript files with relative URLs. The flow is created automatically if it doesn't already exist.";

const inputSchema = z.object({
  flowName: z.string().describe("Name of the flow this design belongs to; created automatically if it doesn't exist"),
  name: z.string().describe("File name to create or update, including its extension (for example index.html, styles.css, or app.js)"),
  content: z.string().describe("Full text content, or base64 data when encoding is base64"),
  encoding: z.enum(["utf8", "base64"]).default("utf8").describe("How content is encoded"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
