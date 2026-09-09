import assert from "node:assert/strict";
import test from "node:test";
import { getV2InChatUiHtml, inChatUiFallbackText, parseInChatUiDisplay, V2_IN_CHAT_FALLBACK_PREFIX, V2_IN_CHAT_MIME_TYPE, V2_IN_CHAT_RESOURCE_METADATA, V2_IN_CHAT_RESOURCE_URI } from "../../src/v2/mcp/in-chat-ui.js";
import { SyntheticUiMockAdapter } from "../../src/v2/mcp/synthetic-ui-mock-adapter.js";

test("v2 in-chat resource has a versioned production-shaped URI and MCP Apps MIME", () => {
  assert.equal(V2_IN_CHAT_RESOURCE_URI, "ui://studymeta/v2/learner-context-and-session-summary-v2");
  assert.equal(V2_IN_CHAT_MIME_TYPE, "text/html;profile=mcp-app");
  assert.equal(V2_IN_CHAT_RESOURCE_METADATA.mimeType, V2_IN_CHAT_MIME_TYPE);
  assert.equal(V2_IN_CHAT_RESOURCE_METADATA._meta.ui.prefersBorder, true);
});

test("synthetic adapter output parses from structured content and text fallback", async () => {
  const display = await new SyntheticUiMockAdapter().getDisplay();
  assert.deepEqual(parseInChatUiDisplay(display), display);
  const text = inChatUiFallbackText(display);
  assert.match(text, /실제 세션·State는 이 도구 결과만으로 변경되지 않습니다/);
  const encoded = text.slice(text.indexOf(V2_IN_CHAT_FALLBACK_PREFIX) + V2_IN_CHAT_FALLBACK_PREFIX.length);
  assert.deepEqual(parseInChatUiDisplay(JSON.parse(encoded)), display);
});

test("invalid contract and forbidden state fields are rejected before rendering", async () => {
  const display: any = await new SyntheticUiMockAdapter().getDisplay();
  display.learner_context.states[0].state_type = "intervention_response";
  assert.equal(parseInChatUiDisplay(display), null);
  display.learner_context.states[0].state_type = "conceptual_mastery";
  display.learner_context.scientific_validation = "supported";
  assert.equal(parseInChatUiDisplay(display), null);
});

test("rendered UI is host-themed, accessible, and leaves backend actions unavailable", () => {
  const html = getV2InChatUiHtml();
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /aria-live/);
  assert.match(html, /disabled aria-disabled="true"/);
  assert.match(html, /navigator\.clipboard/);
  assert.doesNotMatch(html, /intervention_response|state_confidence|scientific_validation/);
});

test("MCP Apps lifecycle listens before initialize and publishes ready plus size handshake", () => {
  const html = getV2InChatUiHtml();
  assert.ok(html.indexOf('ui/notifications/tool-result') < html.indexOf('request("ui/initialize"'));
  assert.match(html, /protocolVersion = "2026-01-26"/);
  assert.match(html, /appInfo: \{ name: "studymeta-v2-in-chat-ui", version: "0\.2\.0" \}/);
  assert.match(html, /availableDisplayModes: \["inline"\]/);
  assert.match(html, /ui\/notifications\/initialized/);
  assert.match(html, /ui\/notifications\/size-changed/);
  assert.match(html, /new ResizeObserver\(notifySizeChanged\)/);
  assert.match(html, /MCP Apps lifecycle handshake timed out/);
  assert.doesNotMatch(html, /clientInfo/);
});
