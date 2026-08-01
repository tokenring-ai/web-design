import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import WebDesignService from "../WebDesignService.ts";

const name = "flow_create";
const displayName = "Web Design/create flow";

async function execute({ name: flowName }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const webDesignService = agent.requireService(WebDesignService);
  const directory = webDesignService.getWebDesignDirectory(agent);
  const flow = await webDesignService.createFlow(directory, flowName);

  return {
    message: `**Web Design** Created flow "${flowName}"`,
    result: JSON.stringify(flow),
  };
}

const description = "Create a new, empty design flow (a named collection of related designs)";

const inputSchema = z.object({
  name: z.string().describe("Name of the flow to create"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
