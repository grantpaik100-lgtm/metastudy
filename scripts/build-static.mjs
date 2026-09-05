import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

const learnerCardModule = await import(
  pathToFileURL(resolve(projectRoot, "dist/src/mcp/learner-card-ui.js")).href,
);
const learnerCardPreview = learnerCardModule
  .getLearnerCardHtml()
  .replace(
    "<head>",
    `<head><script>window.__STUDYMETA_PREVIEW_CONTENT__=${JSON.stringify(
      learnerCardModule.getLearnerCardPreviewContent(),
    )};</script>`,
  );

await writeFile(
  resolve(publicDirectory, "learner-card-preview.html"),
  learnerCardPreview,
  "utf8",
);
