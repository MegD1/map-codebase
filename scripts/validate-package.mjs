import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const requiredFiles = [
  "SKILL.md",
  "README.md",
  "agents/openai.yaml",
  "assets/atlas.config.example.json",
  "assets/atlas-template/index.html",
  "assets/atlas-template/atlas.css",
  "assets/atlas-template/atlas.js",
  "references/authoring.md",
  "references/schema.md",
  "scripts/sync-atlas.mjs",
];

const failures = [];

for (const path of requiredFiles) {
  try {
    await access(new URL(`../${path}`, import.meta.url), constants.R_OK);
  } catch {
    failures.push(`缺少文件：${path}`);
  }
}

try {
  const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
  if (!skill.startsWith("---\n")) failures.push("SKILL.md 缺少 YAML frontmatter");
  if (!/\nname:\s*map-codebase\s*\n/.test(skill)) failures.push("SKILL.md 的 name 必须是 map-codebase");
  if (!/\ndescription:\s*\S/.test(skill)) failures.push("SKILL.md 缺少 description");
} catch {
  // 缺失已经由 requiredFiles 报告。
}

try {
  JSON.parse(await readFile(new URL("../assets/atlas.config.example.json", import.meta.url), "utf8"));
} catch (error) {
  failures.push(`示例配置不是有效 JSON：${error.message}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`map-codebase package valid · ${requiredFiles.length} required files present`);
}
