import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const demoPath = join(root, "demo", "index.html");
const startMarker = "/* GENERATED LIQUID GLASS RUNTIME: START */";
const endMarker = "/* GENERATED LIQUID GLASS RUNTIME: END */";

const shaderRuntime = readFileSync(join(root, "src", "shaders.js"), "utf8")
  .replace(/^export /gm, "");

const componentRuntime = readFileSync(join(root, "src", "liquid-glass.js"), "utf8")
  .replace(/^import \{[\s\S]*?\} from "\.\/shaders\.js";\s*/, "")
  .replace(/^export class LiquidGlass/m, "class LiquidGlass");

const wallpaperData = readFileSync(
  join(root, "assets", "demo-wallpaper-gold.jpg")
).toString("base64");
const assetRuntime =
  `const DEMO_WALLPAPER_DATA_URL = "data:image/jpeg;base64,${wallpaperData}";`;

const runtime = `${shaderRuntime}\n${componentRuntime}\n${assetRuntime}`.trim();
if (runtime.includes("</script>")) {
  throw new Error("Generated runtime contains a closing script tag.");
}

const html = readFileSync(demoPath, "utf8");
const blockPattern = new RegExp(
  `${startMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` +
  `[\\s\\S]*?` +
  `${endMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
);

if (!blockPattern.test(html)) {
  throw new Error("Demo runtime markers were not found.");
}

const output = html.replace(
  blockPattern,
  `${startMarker}\n${runtime}\n${endMarker}`
);

writeFileSync(demoPath, output);
console.log("demo/index.html regenerated");
