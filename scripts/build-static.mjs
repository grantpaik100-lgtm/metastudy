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
const studentWebModule = await import(
  pathToFileURL(resolve(projectRoot, "dist/src/v2/ui/student-web.js")).href,
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

await writeFile(
  resolve(publicDirectory, "student-preview.html"),
  studentWebModule.getStudentWebPreviewHtml(),
  "utf8",
);

// Pre-opened, synthetic-only routes make the IR dashboard and audit-flow states
// inspectable without implying that authentication or a live session succeeded.
const studentPreview = studentWebModule.getStudentWebPreviewHtml();
const openedStudentPreview = studentPreview
  .replace('<section class="login" id="login">', '<section class="login" id="login" hidden>')
  .replace('<div class="app" id="app">', '<div class="app active" id="app">');

await writeFile(
  resolve(publicDirectory, "student-dashboard-preview.html"),
  openedStudentPreview,
  "utf8",
);

const openedSessionPreview = openedStudentPreview
  .replace('<section class="page active" id="page-home">', '<section class="page" id="page-home">')
  .replace('<section class="page" id="page-records">', '<section class="page active" id="page-records">')
  .replace('aria-expanded="false">구조화 요약 보기</button>', 'aria-expanded="true">구조화 요약 숨기기</button>')
  .replace('<article class="card session-detail" hidden>', '<article class="card session-detail">');

await writeFile(
  resolve(publicDirectory, "student-session-preview.html"),
  openedSessionPreview,
  "utf8",
);
