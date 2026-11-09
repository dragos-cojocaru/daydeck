import { describe, expect, it } from "vitest";
import {
  BUFFER_IDEAS_URL,
  bufferDraftsUrl,
  bufferPostingScheduleUrl,
  bufferQueueUrl,
} from "./buffer-links";

describe("bufferDraftsUrl", () => {
  it("opens the channel's Drafts tab in Buffer", () => {
    expect(bufferDraftsUrl("6aef6af0e29c69a1719741ee")).toBe(
      "https://publish.buffer.com/channels/6aef6af0e29c69a1719741ee/schedule?tab=drafts",
    );
  });

  it("keeps an unexpected ID inside its path segment", () => {
    expect(bufferDraftsUrl("../settings?x=1")).toBe(
      "https://publish.buffer.com/channels/..%2Fsettings%3Fx%3D1/schedule?tab=drafts",
    );
  });
});

describe("bufferQueueUrl", () => {
  it("opens the channel's Queue tab, where scheduled posts wait", () => {
    expect(bufferQueueUrl("6aef6af0e29c69a1719741ee")).toBe(
      "https://publish.buffer.com/channels/6aef6af0e29c69a1719741ee/schedule?tab=queue",
    );
  });
});

describe("BUFFER_IDEAS_URL", () => {
  it("opens Buffer's Ideas board", () => {
    expect(BUFFER_IDEAS_URL).toBe("https://publish.buffer.com/create/ideas?view=board");
  });
});

describe("bufferPostingScheduleUrl", () => {
  it("opens the channel's posting schedule settings", () => {
    expect(bufferPostingScheduleUrl("6aef6af0e29c69a1719741ee")).toBe(
      "https://publish.buffer.com/channels/6aef6af0e29c69a1719741ee/settings?tab=posting-schedule",
    );
  });
});
