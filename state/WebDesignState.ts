import type { Agent } from "@tokenring-ai/agent";
import { AgentStateSlice } from "@tokenring-ai/agent/types";
import deepClone from "@tokenring-ai/utility/object/deepClone";
import { z } from "zod";
import { type Design, DesignSchema } from "../schema.ts";

const serializationSchema = z.object({
  currentDesign: DesignSchema.optional(),
  lastAttachedDesignId: z.string().optional(),
});

export class WebDesignState extends AgentStateSlice<typeof serializationSchema> {
  currentDesign: Design | undefined;
  lastAttachedDesignId: string | undefined;

  constructor() {
    super("WebDesignState", serializationSchema);
  }

  transferStateFromParent(parent: Agent): void {
    const parentState = parent.getState(WebDesignState);
    this.currentDesign ??= deepClone(parentState.currentDesign);
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      currentDesign: this.currentDesign,
      lastAttachedDesignId: this.lastAttachedDesignId,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.currentDesign = data.currentDesign;
    this.lastAttachedDesignId = data.lastAttachedDesignId;
  }

  show(): string {
    const current = this.currentDesign ? `${this.currentDesign.flowName}/${this.currentDesign.name}` : "None";
    return `Current Design: ${current}
Last Attached Design ID: ${this.lastAttachedDesignId ?? "None"}`;
  }
}
