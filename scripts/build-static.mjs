import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const publicDirectory = resolve(projectRoot, "public");

await mkdir(publicDirectory, { recursive: true });
const staticFiles = [
  ["viewer.html", "index.html"],
  ["viewer.html", "viewer.html"],
  ["privacy.html", "privacy.html"],
  ["terms.html", "terms.html"],
  ["support.html", "support.html"],
  ["studymeta-logo.svg", "studymeta-logo.svg"],
  ["studymeta-logo.png", "studymeta-logo.png"],
];

await Promise.all(
  staticFiles.map(([sourceFileName, outputFileName]) =>
    copyFile(
      resolve(projectRoot, sourceFileName),
      resolve(publicDirectory, outputFileName),
    ),
  ),
);
