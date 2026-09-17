import { mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });

for (const entry of ["code", "ui"]) {
  const result = await Bun.build({ entrypoints: [`src/${entry}.ts`], format: "iife" });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  const js = await result.outputs[0].text();
  if (entry === "code") {
    await Bun.write("dist/code.js", js);
    continue;
  }
  // Figma loads ui.html from a string with no base URL, so external scripts never load.
  const html = await Bun.file("src/ui.html").text();
  const tag = '<script src="ui.js"></script>';
  if (!html.includes(tag)) throw new Error(`src/ui.html is missing ${tag}`);
  await Bun.write("dist/ui.html", html.replace(tag, () => `<script>\n${js.replaceAll("</script", "<\\/script")}</script>`));
}
