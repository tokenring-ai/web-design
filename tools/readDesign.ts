import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import WebDesignService from "../WebDesignService.ts";

const name = "design_read";
const displayName = "Web Design/read design";

async function execute({ flowName, name: designName }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const webDesignService = agent.requireServiceByType(WebDesignService);
  const directory = webDesignService.getWebDesignDirectory(agent);
  const design = await webDesignService.getDesign(directory, flowName, designName);

  if (!design) {
    return {
      message: `**Web Design** Design "${designName}" not found in flow "${flowName}"`,
      result: JSON.stringify({ error: `Design "${designName}" not found in flow "${flowName}"` }),
    };
  }

  return {
    message: `**Web Design** Read "${flowName}/${designName}"`,
    result: JSON.stringify(design),
  };
}

const description = "Read the HTML content of a design within a design flow";

const inputSchema = z.object({
  flowName: z.string().describe("Name of the flow the design belongs to"),
  name: z.string().describe("Name of the design to read"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
