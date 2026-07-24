import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import WebDesignService from "../WebDesignService.ts";

const name = "design_delete";
const displayName = "Web Design/delete design";

async function execute({ flowName, name: designName }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const webDesignService = agent.requireServiceByType(WebDesignService);
  const directory = webDesignService.getWebDesignDirectory(agent);
  const success = await webDesignService.deleteDesign(directory, flowName, designName);

  return {
    message: success ? `**Web Design** Deleted "${flowName}/${designName}"` : `**Web Design** Design "${designName}" not found in flow "${flowName}"`,
    result: JSON.stringify({ success }),
  };
}

const description = "Delete a design (a single HTML mockup) from a design flow";

const inputSchema = z.object({
  flowName: z.string().describe("Name of the flow the design belongs to"),
  name: z.string().describe("Name of the design to delete"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
