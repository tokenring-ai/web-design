import createFlow from "./tools/createFlow.ts";
import deleteDesign from "./tools/deleteDesign.ts";
import deleteFlow from "./tools/deleteFlow.ts";
import listDesigns from "./tools/listDesigns.ts";
import listFlows from "./tools/listFlows.ts";
import readDesign from "./tools/readDesign.ts";
import writeDesign from "./tools/writeDesign.ts";

export default [listFlows, createFlow, deleteFlow, listDesigns, readDesign, writeDesign, deleteDesign];
