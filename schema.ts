import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import { z } from "zod";

export const FlowSummarySchema = z.object({
  name: z.string(),
  designCount: z.number(),
  updatedAt: z.string(),
  /** Absolute path of the flow directory, so agents can write designs with filesystem tools. */
  absolutePath: z.string(),
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

export const DesignVersionSummarySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  size: z.number(),
});
export type DesignVersionSummary = z.output<typeof DesignVersionSummarySchema>;

export const WebDesignServiceConfigSchema = z
  .object({
    webDesignDirectory: z
      .string()
      .default("web-design")
      .meta({ description: "Directory where design flows are stored" } satisfies ConfigFieldMeta),
    /** Filesystem provider that serves design files over /api/fs (must match the filesystem plugin setup). */
    fsProvider: z
      .string()
      .default("posix")
      .meta({ description: "Filesystem provider used in /api/fs preview URLs for design files" } satisfies ConfigFieldMeta),
    /**
     * Base URL agents use to open hosted design previews (design_screenshot). Defaults to the
     * running web host's own URL when omitted.
     */
    previewBaseUrl: z
      .string()
      .optional()
      .meta({ description: "Base URL used by agents to open hosted design previews; defaults to the web host URL" } satisfies ConfigFieldMeta),
    agentTypes: z
      .array(z.string())
      .default(["web-design", "web-design-visual"])
      .meta({ description: "The available agent types that can be used for web design" } satisfies ConfigFieldMeta),
  })
  .prefault({})
  .meta({ label: "Web Design", description: "Figma-style design flows and designs, backed by files on disk" } satisfies ConfigFieldMeta);

export type WebDesignServiceConfig = z.input<typeof WebDesignServiceConfigSchema>;
export type ParsedWebDesignConfig = z.output<typeof WebDesignServiceConfigSchema>;
