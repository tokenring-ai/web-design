import { AgentStateSlice } from "@tokenring-ai/agent/types";
import { z } from "zod";
import type { ParsedWebDesignConfig } from "../schema.ts";

const serializationSchema = z.object({
  webDesignDirectory: z.string(),
});

export class WebDesignState extends AgentStateSlice<typeof serializationSchema> {
  webDesignDirectory: string;

  constructor(readonly initialConfig: ParsedWebDesignConfig["agentDefaults"]) {
    super("WebDesignState", serializationSchema);
    this.webDesignDirectory = initialConfig.webDesignDirectory;
  }

  serialize(): z.output<typeof serializationSchema> {
    return { webDesignDirectory: this.webDesignDirectory };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.webDesignDirectory = data.webDesignDirectory;
  }

  show(): string {
    return `Web Design Directory: ${this.webDesignDirectory}`;
  }
}
