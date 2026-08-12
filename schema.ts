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
  mimeType: z.string().default("text/html"),
  updatedAt: z.string(),
});
export type DesignSummary = z.output<typeof DesignSummarySchema>;

export const DesignSchema = DesignSummarySchema.extend({
  content: z.string(),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
});
export type Design = z.output<typeof DesignSchema>;

export const WebDesignServiceConfigSchema = z
  .object({
    webDesignDirectory: z
      .string()
      .default("web-design")
      .meta({ description: "Directory where design flows are stored" } satisfies ConfigFieldMeta),
    agentTypes: z
      .array(z.string())
      .default(["web-design"])
      .meta({ description: "The available agent types that can be used for web design" } satisfies ConfigFieldMeta),
  })
  .prefault({})
  .meta({ label: "Web Design", description: "Figma-style design flows and designs, backed by files on disk" } satisfies ConfigFieldMeta);

export type WebDesignServiceConfig = z.input<typeof WebDesignServiceConfigSchema>;
export type ParsedWebDesignConfig = z.output<typeof WebDesignServiceConfigSchema>;
