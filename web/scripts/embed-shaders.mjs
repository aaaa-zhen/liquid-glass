// Regenerates src/shaders.js from the canonical GLSL sources in src/shaders/.
// Run: npm run build:shaders
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = name => readFileSync(join(root, "src", "shaders", name), "utf8");

const escape = source => source.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const output = `// GENERATED FILE - do not edit. Source of truth: src/shaders/*.glsl
// Regenerate with: npm run build:shaders

export const VERTEX_SHADER = \`${escape(read("vertex.glsl"))}\`;

export const BLUR_FRAGMENT_SHADER = \`${escape(read("blur.frag.glsl"))}\`;

export const GLASS_FRAGMENT_SHADER = \`${escape(read("glass.frag.glsl"))}\`;
`;

writeFileSync(join(root, "src", "shaders.js"), output);
console.log("src/shaders.js regenerated");
