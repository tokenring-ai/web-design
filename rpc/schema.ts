import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { AgentNotFoundSchema, SuccessSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import { DesignSchema, DesignSummarySchema, DesignVersionSummarySchema, FlowSummarySchema } from "../schema.ts";

export default {
  name: "Web Design RPC",
  path: "/rpc/web-design",
  methods: {
    getWebDesignConfiguration: {
      type: "query",
      input: z.object({}),
      result: z.object({
        agentTypes: z.array(z.string()),
        /** Configured directory name relative to the workspace (e.g. `web-design`). */
        webDesignDirectory: z.string(),
        /**
         * Workspace-relative path for `/api/fs/...` preview URLs.
         * Typically `.tokenring/web-design` when workspaceDirectory is `<working>/.tokenring`.
         */
        serveDirectory: z.string(),
        /** Base URL agents use to open hosted design previews; null means "derive from the web host". */
        previewBaseUrl: z.string().nullable(),
      }),
    },
    listFlows: {
      type: "query",
      input: z.object({}),
      result: z.object({
        flows: z.array(FlowSummarySchema),
      }),
    },
    streamFlows: {
      type: "stream",
      input: z.object({}),
      result: z.object({
        flows: z.array(FlowSummarySchema),
      }),
    },
    createFlow: {
      type: "mutation",
      input: z.object({
        name: z.string(),
      }),
      result: z.object({
        flow: FlowSummarySchema,
      }),
    },
    deleteFlow: {
      type: "mutation",
      input: z.object({
        name: z.string(),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    renameFlow: {
      type: "mutation",
      input: z.object({
        name: z.string(),
        newName: z.string(),
      }),
      result: z.object({
        flow: FlowSummarySchema,
      }),
    },
    duplicateFlow: {
      type: "mutation",
      input: z.object({
        name: z.string(),
        newName: z.string(),
      }),
      result: z.object({
        flow: FlowSummarySchema,
      }),
    },
    /** A whole flow as a ZIP archive (entries under `<flow>/`), base64-encoded. */
    exportFlow: {
      type: "query",
      input: z.object({
        name: z.string(),
      }),
      result: z.object({
        fileName: z.string(),
        mimeType: z.literal("application/zip"),
        content: z.string(),
        fileCount: z.number(),
      }),
    },
    listDesigns: {
      type: "query",
      input: z.object({
        flowName: z.string(),
      }),
      result: z.object({
        designs: z.array(DesignSummarySchema),
      }),
    },
    streamDesigns: {
      type: "stream",
      input: z.object({
        flowName: z.string(),
      }),
      result: z.object({
        designs: z.array(DesignSummarySchema),
      }),
    },
    getDesign: {
      type: "query",
      input: z.object({
        flowName: z.string(),
        name: z.string(),
      }),
      result: z.object({
        design: DesignSchema.nullable(),
      }),
    },
    createDesign: {
      type: "mutation",
      input: z.object({
        flowName: z.string(),
        name: z.string(),
        content: z.string().default(""),
        encoding: z.enum(["utf8", "base64"]).default("utf8"),
      }),
      result: z.object({
        design: DesignSchema,
      }),
    },
    updateDesign: {
      type: "mutation",
      input: z.object({
        flowName: z.string(),
        name: z.string(),
        content: z.string(),
        encoding: z.enum(["utf8", "base64"]).default("utf8"),
      }),
      result: z.object({
        design: DesignSchema,
      }),
    },
    deleteDesign: {
      type: "mutation",
      input: z.object({
        flowName: z.string(),
        name: z.string(),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    /** Moves a design to a new name (and optionally another flow); refuses to overwrite. */
    renameDesign: {
      type: "mutation",
      input: z.object({
        flowName: z.string(),
        name: z.string(),
        newFlowName: z.string().exactOptional(),
        newName: z.string(),
      }),
      result: z.object({
        design: DesignSchema,
      }),
    },
    /** Copies a design to a new name (and optionally another flow); refuses to overwrite. */
    duplicateDesign: {
      type: "mutation",
      input: z.object({
        flowName: z.string(),
        name: z.string(),
        newFlowName: z.string().exactOptional(),
        newName: z.string(),
      }),
      result: z.object({
        design: DesignSchema,
      }),
    },
    /**
     * Screenshots a saved design in a headless browser (same capture as the
     * design_screenshot tool). With `save` (default) the PNG is also stored in
     * the flow under `screenshots/`.
     */
    captureDesignScreenshot: {
      type: "mutation",
      input: z.object({
        flowName: z.string(),
        name: z.string(),
        width: z.number().int().min(1).max(16384).exactOptional(),
        height: z.number().int().min(1).max(16384).exactOptional(),
        save: z.boolean().default(true),
      }),
      result: z.object({
        /** Flow-relative name of the saved PNG, or null when not saved. */
        savedAs: z.string().nullable(),
        /** PNG bytes, base64-encoded. */
        content: z.string(),
        mimeType: z.literal("image/png"),
        viewport: z.object({ width: z.number(), height: z.number() }),
        console: z.string(),
      }),
    },
    listDesignHistory: {
      type: "query",
      input: z.object({
        flowName: z.string(),
        name: z.string(),
      }),
      result: z.object({
        versions: z.array(DesignVersionSummarySchema),
      }),
    },
    getDesignVersion: {
      type: "query",
      input: z.object({
        flowName: z.string(),
        name: z.string(),
        versionId: z.string(),
      }),
      result: z.object({
        version: z
          .object({
            id: z.string(),
            createdAt: z.string(),
            content: z.string(),
            encoding: z.enum(["utf8", "base64"]),
            mimeType: z.string(),
          })
          .nullable(),
      }),
    },
    getWebDesignState: {
      type: "query",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          selectedFlowName: z.string().nullable(),
          selectedDesignName: z.string().nullable(),
        }),
        AgentNotFoundSchema,
      ]),
    },
    updateWebDesignState: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        /** Both names select that design as the agent's current design; null for either clears the selection. */
        selectedFlowName: z.string().nullable().exactOptional(),
        selectedDesignName: z.string().nullable().exactOptional(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          selectedFlowName: z.string().nullable(),
          selectedDesignName: z.string().nullable(),
        }),
        AgentNotFoundSchema,
      ]),
    },
  },
} satisfies RPCSchema;
