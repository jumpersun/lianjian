import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Reproduce the bundled text-only dataset from the pinned upstream file.
// No media is downloaded or copied. Unknown upstream revisions fail closed.
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Usage: node scripts/prepare-data.mjs /path/to/upstream/data/exercises.json");
const raw = await readFile(sourcePath);
const expectedHash = "656634224b8977b99a6d765470ee123260d4979715eaa4e7c0b7c8bb0d79f93d";
if (createHash("sha256").update(raw).digest("hex") !== expectedHash) throw new Error("Upstream checksum differs. Review the dataset and license before updating the pinned checksum.");
const fields = ["id", "name", "category", "body_part", "equipment", "muscle_group", "secondary_muscles", "target", "image", "gif_url", "media_id", "attribution"];
const data = JSON.parse(raw).map((exercise) => ({
  ...Object.fromEntries(fields.map((key) => [key, exercise[key]])),
  instructions: { zh: exercise.instructions.zh, en: exercise.instructions.en },
  instruction_steps: { zh: exercise.instruction_steps.zh, en: exercise.instruction_steps.en },
}));
const output = new URL("../public/data/exercises.json", import.meta.url);
await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await writeFile(output, JSON.stringify(data));
console.log(`Prepared ${data.length} text records: ${fileURLToPath(output)}. Media filenames are metadata only; no media included.`);
