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
         * Working-directory-relative path for `/api/fs/{provider}/...` preview URLs.
         * Typically `.tokenring/web-design` when workspaceDirectory is `<working>/.tokenring`.
         */
        serveDirectory: z.string(),
        /** Filesystem provider used in `/api/fs/{provider}/...` preview URLs. */
        fsProvider: z.string(),
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
        selectedFlowName: z.string().exactOptional(),
        selectedDesignName: z.string().exactOptional(),
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
