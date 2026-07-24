import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import WebDesignService from "../WebDesignService.ts";

const name = "flow_delete";
const displayName = "Web Design/delete flow";

async function execute({ name: flowName }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const webDesignService = agent.requireServiceByType(WebDesignService);
  const directory = webDesignService.getWebDesignDirectory(agent);
  const success = await webDesignService.deleteFlow(directory, flowName);

  return {
    message: success ? `**Web Design** Deleted flow "${flowName}"` : `**Web Design** Flow "${flowName}" not found`,
    result: JSON.stringify({ success }),
  };
}

const description = "Delete a design flow and all of the designs it contains";

const inputSchema = z.object({
  name: z.string().describe("Name of the flow to delete"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
