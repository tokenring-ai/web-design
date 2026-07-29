import { AfterInputReceived } from "@tokenring-ai/agent";
import type Agent from "@tokenring-ai/agent/Agent";
import type { HookSubscription } from "@tokenring-ai/lifecycle/types";
import { HookCallback } from "@tokenring-ai/lifecycle/util/hooks";
import { WebDesignState } from "../state/WebDesignState.ts";

const name = "addSelectedDesign";
const displayName = "Web Design/Add currently selected design to chat";
const description = "Attaches the currently selected HTML design to the chat message";

function designAttachmentId(flowName: string, designName: string): string {
  return `${flowName}/${designName}`;
}

async function addSelectedDesign(data: AfterInputReceived, agent: Agent) {
  const attachments = (data.input.attachments ??= []);
  agent.mutateState(WebDesignState, state => {
    if (!state.currentDesign) return;

    const designId = designAttachmentId(state.currentDesign.flowName, state.currentDesign.name);
    if (state.lastAttachedDesignId === designId) return;

    state.lastAttachedDesignId = designId;
    attachments.push({
      name: `${state.currentDesign.flowName}/${state.currentDesign.name}.html`,
      description: "The HTML below is the currently selected design mockup.",
      encoding: "text",
      mimeType: "text/html",
      body: state.currentDesign.content,
    });
  });
}

const callbacks = [new HookCallback(AfterInputReceived, addSelectedDesign)];

export default {
  name,
  displayName,
  description,
  callbacks,
} satisfies HookSubscription;
