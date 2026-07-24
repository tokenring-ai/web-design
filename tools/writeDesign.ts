import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import WebDesignService from "../WebDesignService.ts";

const name = "design_write";
const displayName = "Web Design/write design";

async function execute({ flowName, name: designName, content }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const webDesignService = agent.requireServiceByType(WebDesignService);
  const directory = webDesignService.getWebDesignDirectory(agent);
  const design = await webDesignService.updateDesign(directory, flowName, designName, content);

  return {
    message: `**Web Design** Saved "${flowName}/${designName}"`,
    result: JSON.stringify({ flowName: design.flowName, name: design.name, size: design.size, updatedAt: design.updatedAt }),
  };
}

const description =
  "Create or overwrite a design (a single HTML mockup) within a design flow. The flow is created automatically if it doesn't already exist. Use this to save UI mockups so they can be referenced later or viewed by the user.";

const inputSchema = z.object({
  flowName: z.string().describe("Name of the flow this design belongs to; created automatically if it doesn't exist"),
  name: z.string().describe("Name of the design to create or update"),
  content: z.string().describe("Full HTML content of the design"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
