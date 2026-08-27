import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const publicDirectory = resolve(projectRoot, "public");

await mkdir(publicDirectory, { recursive: true });
await Promise.all(
  ["index.html", "viewer.html"].map((fileName) =>
    copyFile(resolve(projectRoot, fileName), resolve(publicDirectory, fileName)),
  ),
);
