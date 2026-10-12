import type { ContextHandlerOptions, ContextItem } from "@tokenring-ai/chat/schema";
import { WebDesignState } from "../state/WebDesignState.ts";
import WebDesignService from "../WebDesignService.ts";

export const CURRENT_DESIGN_CONTEXT = "web-design-current-design";

/**
 * Tells a design agent which file the user has open in the Web Design app
 * (selected through `updateWebDesignState` when the user opens a design), so
 * "make this button bigger" resolves without the user naming the file. Only
 * the path is sent: the agent reads fresh content with the file tools.
 */
export default function* getCurrentDesignContext({ agent }: ContextHandlerOptions): Generator<ContextItem> {
  const current = agent.getState(WebDesignState).currentDesign;
  if (!current) return;
  let location = "";
  try {
    location = ` (absolute path: ${agent.requireService(WebDesignService).getFlowPath(current.flowName)}/${current.name})`;
  } catch {
    // The flow name no longer validates; name the design without a path.
  }
  yield {
    role: "user",
    content: `/* Web Design */\nThe user currently has the design "${current.flowName}/${current.name}" open in the Web Design app${location}. When they refer to "this design", "this page" or "the current screen", they mean this file.`,
  };
}
