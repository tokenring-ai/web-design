import { BeforeInputReceived } from "@tokenring-ai/agent";
import type Agent from "@tokenring-ai/agent/Agent";
import type { SupportedMimeTypes } from "@tokenring-ai/agent/AgentEvents";
import type { HookSubscription } from "@tokenring-ai/lifecycle/types";
import { HookCallback } from "@tokenring-ai/lifecycle/util/hooks";
import { WebDesignState } from "../state/WebDesignState.ts";

const name = "addSelectedDesign";
const displayName = "Web Design/Add currently selected design to chat";
const description = "Attaches the currently selected design file to the chat message";

function designAttachmentId(flowName: string, designName: string): string {
  return `${flowName}/${designName}`;
}

function supportedAttachmentMimeType(mimeType: string, isText: boolean): SupportedMimeTypes | null {
  switch (mimeType) {
    case "audio/wav":
    case "audio/mpeg":
    case "audio/webm":
    case "video/mp4":
    case "video/webm":
    case "image/png":
    case "image/jpeg":
    case "image/webp":
    case "text/plain":
    case "text/markdown":
    case "text/html":
    case "text/x-diff":
    case "application/json":
    case "message/rfc822":
      return mimeType;
    default:
      return isText ? "text/plain" : null;
  }
}

async function addSelectedDesign(data: BeforeInputReceived, agent: Agent) {
  const attachments = (data.input.attachments ??= []);
  agent.mutateState(WebDesignState, state => {
    if (!state.currentDesign) return;

    const designId = designAttachmentId(state.currentDesign.flowName, state.currentDesign.name);
    if (state.lastAttachedDesignId === designId) return;

    state.lastAttachedDesignId = designId;
    const mimeType = supportedAttachmentMimeType(state.currentDesign.mimeType, state.currentDesign.encoding === "utf8");
    if (!mimeType) return;
    attachments.push({
      name: `${state.currentDesign.flowName}/${state.currentDesign.name}`,
      description: "This is the currently selected file from the web design flow.",
      encoding: state.currentDesign.encoding === "utf8" ? "text" : "base64",
      mimeType,
      body: state.currentDesign.content,
    });
  });
}

const callbacks = [new HookCallback(BeforeInputReceived, addSelectedDesign)];

export default {
  name,
  displayName,
  description,
  callbacks,
} satisfies HookSubscription;
