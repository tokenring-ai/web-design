import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import { CURRENT_DESIGN_CONTEXT } from "../contextHandlers/currentDesign.ts";
import WebDesignService from "../WebDesignService.ts";

const name = "flow_create";
const displayName = "Web Design/create flow";

async function execute({ name: flowName }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const webDesignService = agent.requireService(WebDesignService);
  const flow = await webDesignService.createFlow(flowName);

  return {
    message: `**Web Design** Created flow "${flowName}" — write its designs under ${flow.absolutePath}`,
    result: JSON.stringify({
      ...flow,
      hint: "Write designs into this directory with file_write (full HTML documents, relative URLs between sibling files). The directory must be inside your allowed filesystem paths.",
    }),
  };
}

const description =
  "Create a new, empty design flow (a named collection of related designs) and return the absolute directory " +
  "to write its designs into with the file tools. Writing a design into a flow directory that does not exist " +
  "yet also works (file_write creates parent directories), so calling this first is optional.";

const inputSchema = z.object({
  name: z.string().describe("Name of the flow to create"),
});

export default {
  name,
  displayName,
  description,
  requiredContextHandlers: [CURRENT_DESIGN_CONTEXT],
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
