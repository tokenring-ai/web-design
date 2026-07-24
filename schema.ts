import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import { z } from "zod";

export const FlowSummarySchema = z.object({
  name: z.string(),
  designCount: z.number(),
  updatedAt: z.string(),
});
export type FlowSummary = z.output<typeof FlowSummarySchema>;

export const DesignSummarySchema = z.object({
  flowName: z.string(),
  name: z.string(),
  size: z.number(),
  updatedAt: z.string(),
});
export type DesignSummary = z.output<typeof DesignSummarySchema>;

export const DesignSchema = DesignSummarySchema.extend({
  content: z.string(),
});
export type Design = z.output<typeof DesignSchema>;

export const WebDesignAgentConfigSchema = z
  .object({
    webDesignDirectory: z.string().exactOptional(),
  })
  .prefault({});

export type WebDesignAgentConfig = z.output<typeof WebDesignAgentConfigSchema>;

export const WebDesignServiceConfigSchema = z
  .object({
    agentDefaults: z
      .object({
        webDesignDirectory: z.string().meta({ description: "Directory where design flows are stored" } satisfies ConfigFieldMeta),
      })
      .meta({ label: "Agent Defaults" } satisfies ConfigFieldMeta),
  })
  .meta({ label: "Web Design", description: "Figma-style design flows and designs, backed by files on disk" } satisfies ConfigFieldMeta);

export type WebDesignServiceConfig = z.input<typeof WebDesignServiceConfigSchema>;
export type ParsedWebDesignConfig = z.output<typeof WebDesignServiceConfigSchema>;
