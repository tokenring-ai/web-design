import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import { DesignSchema, DesignSummarySchema, FlowSummarySchema } from "../schema.ts";

export default {
  name: "Web Design RPC",
  path: "/rpc/web-design",
  methods: {
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
  },
} satisfies RPCSchema;
