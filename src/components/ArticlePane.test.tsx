/**
 * Tests for the YouTube video-window behaviour introduced in the PR:
 *   – `openVideoWindow()` invokes the Tauri `open_video_window` command
 *   – the auto-open `useEffect` fires once per unique YouTube URL
 *   – the content area renders the play-button UI (not an iframe) for YouTube
 *   – non-YouTube URLs do not trigger the play-button UI
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── Mock heavy Tauri / plugin dependencies ──────────────────────────────────

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  // Channel is used elsewhere in the component; stub it out.
  Channel: class {
    onmessage = vi.fn();
  },
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

// ── Mock database helpers ────────────────────────────────────────────────────

vi.mock("../lib/db", () => ({
  upsertItemState: vi.fn().mockResolvedValue(undefined),
  getItemProgress: vi.fn().mockResolvedValue(null),
  getHighlightsForItem: vi.fn().mockResolvedValue([]),
  addHighlight: vi.fn().mockResolvedValue(undefined),
  updateHighlightNote: vi.fn().mockResolvedValue(undefined),
  deleteHighlight: vi.fn().mockResolvedValue(undefined),
  getItemContent: vi.fn().mockResolvedValue(null),
  setItemContent: vi.fn().mockResolvedValue(undefined),
  getItemTakeaways: vi.fn().mockResolvedValue(null),
  setItemTakeaways: vi.fn().mockResolvedValue(undefined),
  isArticleSaved: vi.fn().mockResolvedValue(false),
  saveExternalArticle: vi.fn().mockResolvedValue(undefined),
  removeSavedArticleByUrl: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock settings helpers ────────────────────────────────────────────────────

vi.mock("../lib/settings", () => ({
  getOllamaSettings: vi.fn().mockResolvedValue(null),
  getObsidianVaultPath: vi.fn().mockResolvedValue(null),
  getTtsEngine: vi.fn().mockResolvedValue("system"),
  getGoogleTtsApiKey: vi.fn().mockResolvedValue(null),
}));

// ── Mock highlight-anchor ────────────────────────────────────────────────────

vi.mock("../lib/highlight-anchor", () => ({
  anchorFromRange: vi.fn(),
  findRange: vi.fn(),
  wrapRangeWithMarks: vi.fn(),
  unwrapHighlights: vi.fn(),
}));

// ── Mock third-party content libs ───────────────────────────────────────────

vi.mock("@mozilla/readability", () => ({
  Readability: class {
    parse() {
      return { title: "Test", byline: null, siteName: null, content: "<p>Hello</p>", excerpt: "" };
    }
  },
}));

vi.mock("dompurify", () => ({
  default: { sanitize: (html: string) => html },
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import ArticlePane from "./ArticlePane";

const YT_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YT_URL_2 = "https://www.youtube.com/watch?v=aaaaaaaaaaaa";
const NON_YT_URL = "https://example.com/some-article";

function renderArticlePane(url: string, title: string | null = "Test Video") {
  const onClose = vi.fn();
  return {
    onClose,
    ...render(
      <ArticlePane url={url} title={title} itemId={null} onClose={onClose} />
    ),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ArticlePane – YouTube video window (PR changes)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: open_video_window resolves successfully
    mockInvoke.mockResolvedValue(undefined);
  });

  // ── UI rendering ──────────────────────────────────────────────────────────

  describe("rendering for YouTube URLs", () => {
    it("shows the play-button card for a YouTube watch URL", async () => {
      renderArticlePane(YT_URL, "My Video");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /play video/i })).toBeInTheDocument();
      });
    });

    it("displays the video title inside the play-button card", async () => {
      renderArticlePane(YT_URL, "My Cool Video");

      await waitFor(() => {
        // The title appears in both the header and the card body; getAllByText
        // ensures it is present in the card (the <p> element inside the card).
        const matches = screen.getAllByText("My Cool Video");
        expect(matches.length).toBeGreaterThanOrEqual(1);
        // At least one match should be a <p> (the card body title)
        const cardTitle = matches.find((el) => el.tagName === "P");
        expect(cardTitle).toBeInTheDocument();
      });
    });

    it("falls back to 'Video' when title is null", async () => {
      renderArticlePane(YT_URL, null);

      await waitFor(() => {
        // The fallback text renders in the card
        expect(screen.getByText("Video")).toBeInTheDocument();
      });
    });

    it("shows 'Plays in a separate window' label", async () => {
      renderArticlePane(YT_URL);

      await waitFor(() => {
        expect(screen.getByText(/plays in a separate window/i)).toBeInTheDocument();
      });
    });

    it("does NOT render an iframe for YouTube URLs", async () => {
      const { container } = renderArticlePane(YT_URL);

      await waitFor(() => {
        expect(container.querySelector("iframe")).toBeNull();
      });
    });
  });

  describe("rendering for non-YouTube URLs", () => {
    it("does NOT show the play-button card for a non-YouTube URL", async () => {
      // Mock fetch_article_html so the extract effect can resolve
      mockInvoke.mockImplementation((command: string) => {
        if (command === "fetch_article_html") {
          return Promise.resolve("<html><body><p>Article content</p></body></html>");
        }
        return Promise.resolve(undefined);
      });

      renderArticlePane(NON_YT_URL, "An article");

      // Give effects time to run
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(screen.queryByRole("button", { name: /play video/i })).toBeNull();
    });

    it("does NOT invoke open_video_window for a non-YouTube URL", async () => {
      mockInvoke.mockImplementation((command: string) => {
        if (command === "fetch_article_html") {
          return Promise.resolve("<html><body><p>content</p></body></html>");
        }
        return Promise.resolve(undefined);
      });

      renderArticlePane(NON_YT_URL, "An article");

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const videoWindowCalls = mockInvoke.mock.calls.filter(
        ([cmd]) => cmd === "open_video_window"
      );
      expect(videoWindowCalls).toHaveLength(0);
    });
  });

  // ── Auto-open useEffect ───────────────────────────────────────────────────

  describe("auto-open behaviour", () => {
    it("invokes open_video_window automatically on mount for a YouTube URL", async () => {
      renderArticlePane(YT_URL, "Auto-open test");

      await waitFor(() => {
        const calls = mockInvoke.mock.calls.filter(
          ([cmd]) => cmd === "open_video_window"
        );
        expect(calls).toHaveLength(1);
      });
    });

    it("passes the URL and title to open_video_window", async () => {
      renderArticlePane(YT_URL, "Rick Astley");

      await waitFor(() => {
        const call = mockInvoke.mock.calls.find(([cmd]) => cmd === "open_video_window");
        expect(call).toBeDefined();
        expect(call![1]).toEqual({ url: YT_URL, title: "Rick Astley" });
      });
    });

    it("passes null title when no title is provided", async () => {
      renderArticlePane(YT_URL, null);

      await waitFor(() => {
        const call = mockInvoke.mock.calls.find(([cmd]) => cmd === "open_video_window");
        expect(call).toBeDefined();
        expect(call![1]).toEqual({ url: YT_URL, title: null });
      });
    });

    it("does NOT invoke open_video_window a second time when re-rendered with the same URL", async () => {
      const { rerender } = renderArticlePane(YT_URL, "Video");

      await waitFor(() => {
        expect(
          mockInvoke.mock.calls.filter(([cmd]) => cmd === "open_video_window")
        ).toHaveLength(1);
      });

      // Re-render with same URL – the ref guard should prevent a second call.
      rerender(
        <ArticlePane url={YT_URL} title="Video" itemId={null} onClose={vi.fn()} />
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });

      expect(
        mockInvoke.mock.calls.filter(([cmd]) => cmd === "open_video_window")
      ).toHaveLength(1);
    });

    it("invokes open_video_window again when the URL changes to a different YouTube URL", async () => {
      const { rerender } = renderArticlePane(YT_URL, "Video 1");

      await waitFor(() => {
        expect(
          mockInvoke.mock.calls.filter(([cmd]) => cmd === "open_video_window")
        ).toHaveLength(1);
      });

      // Navigate to a different YouTube video
      rerender(
        <ArticlePane url={YT_URL_2} title="Video 2" itemId={null} onClose={vi.fn()} />
      );

      await waitFor(() => {
        expect(
          mockInvoke.mock.calls.filter(([cmd]) => cmd === "open_video_window")
        ).toHaveLength(2);
      });
    });
  });

  // ── "Play video" button ───────────────────────────────────────────────────

  describe('"Play video" button', () => {
    it("invokes open_video_window when the Play video button is clicked", async () => {
      const user = userEvent.setup();
      renderArticlePane(YT_URL, "Click test");

      const btn = await screen.findByRole("button", { name: /play video/i });

      // Clear previous auto-open call(s) so we can isolate the click
      vi.clearAllMocks();
      mockInvoke.mockResolvedValue(undefined);

      await user.click(btn);

      await waitFor(() => {
        const calls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "open_video_window");
        expect(calls).toHaveLength(1);
        expect(calls[0][1]).toMatchObject({ url: YT_URL });
      });
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("does not crash the component when open_video_window invoke rejects", async () => {
      mockInvoke.mockRejectedValue(new Error("window creation failed"));

      renderArticlePane(YT_URL, "Error test");

      // Give the effect time to run and reject
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Play button is still shown even after the failed invoke
      expect(screen.getByRole("button", { name: /play video/i })).toBeInTheDocument();
    });

    it("logs an error to console when open_video_window invoke rejects", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockInvoke.mockRejectedValue(new Error("boom"));

      renderArticlePane(YT_URL, "Error test");

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to open video window:",
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });
  });

  // ── Regression: removed iframe / embed ───────────────────────────────────

  describe("regression: removed YouTube embed", () => {
    it("no iframe is ever rendered for any YouTube URL variant", async () => {
      const urls = [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
      ];

      for (const url of urls) {
        const { container, unmount } = renderArticlePane(url, "Video");

        await waitFor(() => {
          expect(container.querySelector("iframe")).toBeNull();
        });

        unmount();
        vi.clearAllMocks();
        mockInvoke.mockResolvedValue(undefined);
      }
    });
  });
});