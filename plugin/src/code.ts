import { dispatch } from "./handlers";
import type { BridgeRequest } from "./handlers/protocol";

figma.showUI(__html__, { width: 240, height: 120, themeColors: true });

figma.on("selectionchange", () => {
  figma.ui.postMessage({
    source: "figma-bridge",
    type: "event",
    name: "selectionchange",
    nodes: figma.currentPage.selection.map((n) => n.id),
  });
});

figma.ui.onmessage = (msg: BridgeRequest) => {
  if (msg?.source !== "figma-bridge") return;
  dispatch(msg);
};
