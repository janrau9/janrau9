import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Cv } from "./cv.ts";
import { validateContentDir } from "./load.ts";

const [command, target] = process.argv.slice(2);

if (command === "validate" && target) {
  const issues = validateContentDir(resolve(target));
  for (const i of issues) console.error(`${i.file}${i.path ? ` ${i.path}` : ""}: ${i.message}`);
  if (issues.length > 0) {
    console.error(`\n✗ ${issues.length} problem${issues.length === 1 ? "" : "s"} in content`);
    process.exit(1);
  }
  console.log("✓ content is valid");
} else if (command === "json-schema" && target) {
  // Editors use this to validate cv.yaml as you type; CI checks it is up to date.
  const schema = z.toJSONSchema(Cv, { target: "draft-2020-12" });
  writeFileSync(resolve(target), `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`wrote ${target}`);
} else {
  console.error("usage: cli.ts validate <content-dir> | json-schema <out-file>");
  process.exit(2);
}
