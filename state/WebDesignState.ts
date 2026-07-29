import type { Agent } from "@tokenring-ai/agent";
import { AgentStateSlice } from "@tokenring-ai/agent/types";
import deepClone from "@tokenring-ai/utility/object/deepClone";
import { z } from "zod";
import { type Design, DesignSchema, type ParsedWebDesignConfig } from "../schema.ts";

const serializationSchema = z.object({
  webDesignDirectory: z.string(),
  currentDesign: DesignSchema.optional(),
  lastAttachedDesignId: z.string().optional(),
});

export class WebDesignState extends AgentStateSlice<typeof serializationSchema> {
  webDesignDirectory: string;
  currentDesign: Design | undefined;
  lastAttachedDesignId: string | undefined;

  constructor(readonly initialConfig: ParsedWebDesignConfig["agentDefaults"]) {
    super("WebDesignState", serializationSchema);
    this.webDesignDirectory = initialConfig.webDesignDirectory;
  }

  transferStateFromParent(parent: Agent): void {
    const parentState = parent.getState(WebDesignState);
    this.currentDesign ??= deepClone(parentState.currentDesign);
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      webDesignDirectory: this.webDesignDirectory,
      currentDesign: this.currentDesign,
      lastAttachedDesignId: this.lastAttachedDesignId,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.webDesignDirectory = data.webDesignDirectory;
    this.currentDesign = data.currentDesign;
    this.lastAttachedDesignId = data.lastAttachedDesignId;
  }

  show(): string {
    const current = this.currentDesign ? `${this.currentDesign.flowName}/${this.currentDesign.name}` : "None";
    return `Web Design Directory: ${this.webDesignDirectory}
    Current Design: ${current}
    Last Attached Design ID: ${this.lastAttachedDesignId ?? "None"}`;
  }
}
