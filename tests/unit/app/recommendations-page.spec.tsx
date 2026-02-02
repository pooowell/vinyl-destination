import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- Mocks ---

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock child components to isolate page logic
vi.mock("@/components/Navbar", () => ({
  default: () => <nav data-testid="navbar">Navbar</nav>,
}));

vi.mock("@/components/AlbumGrid", () => ({
  default: ({
    albums,
    onOwn,
    onWishlist,
    onSkip,
    onClick,
    emptyMessage,
  }: {
    albums: Array<{ id: string; name: string; artist: string; imageUrl: string }>;
    onOwn?: (album: { id: string; name: string; artist: string; imageUrl: string }) => void;
    onWishlist?: (album: { id: string; name: string; artist: string; imageUrl: string }) => void;
    onSkip?: (album: { id: string; name: string; artist: string; imageUrl: string }) => void;
    onClick?: (album: { id: string; name: string; artist: string; imageUrl: string }) => void;
    emptyMessage?: string;
  }) => (
    <div data-testid="album-grid">
      {albums.length === 0 && <p>{emptyMessage}</p>}
      {albums.map((a) => (
        <div key={a.id} data-testid={`album-${a.id}`}>
          <span>{a.name}</span>
          <button data-testid={`own-${a.id}`} onClick={() => onOwn?.(a)}>
            Own
          </button>
          <button data-testid={`wishlist-${a.id}`} onClick={() => onWishlist?.(a)}>
            Wishlist
          </button>
          <button data-testid={`skip-${a.id}`} onClick={() => onSkip?.(a)}>
            Skip
          </button>
          <button data-testid={`click-${a.id}`} onClick={() => onClick?.(a)}>
            Details
          </button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/AlbumDetailModal", () => ({
  default: ({
    isOpen,
    onOwn,
    onWishlist,
    onSkip,
    onNotInterested,
    onClose,
  }: {
    albumId: string;
    albumName: string;
    artistName: string;
    imageUrl: string;
    isOpen: boolean;
    onClose: () => void;
    onOwn: () => void;
    onWishlist: () => void;
    onSkip: () => void;
    onNotInterested: () => void;
  }) =>
    isOpen ? (
      <div data-testid="modal">
        <button data-testid="modal-own" onClick={onOwn}>
          Own
        </button>
        <button data-testid="modal-wishlist" onClick={onWishlist}>
          Wishlist
        </button>
        <button data-testid="modal-skip" onClick={onSkip}>
          Skip
        </button>
        <button data-testid="modal-not-interested" onClick={onNotInterested}>
          Not Interested
        </button>
        <button data-testid="modal-close" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

// Import the page component after mocks
import RecommendationsPage from "@/app/recommendations/page";

// --- Helpers ---

const fakeAlbum = {
  id: "album-1",
  name: "Test Album",
  artist: "Test Artist",
  imageUrl: "https://example.com/img.jpg",
  source: "saved",
  discogsUrl: null,
};

/** Create a fake SSE stream that immediately yields albums then closes. */
function makeSSEStream(albums: typeof fakeAlbum[]) {
  const lines = albums.map((a) => `data: ${JSON.stringify(a)}\n`).join("") + "data: [DONE]\n";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
  return stream;
}

function mockStreamOk(albums: typeof fakeAlbum[] = [fakeAlbum]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/api/recommendations/stream")) {
      return new Response(makeSSEStream(albums), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    // Default for collection calls — should not reach here in error tests
    return new Response("OK", { status: 200 });
  });
}

describe("RecommendationsPage – error handling", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows an error banner when an album action fails (non-ok response)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // Stream returns one album; collection POST returns 500
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/recommendations/stream")) {
        return new Response(makeSSEStream([fakeAlbum]), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      // Simulate server error for collection endpoint
      return new Response("Internal Server Error", { status: 500 });
    });

    render(<RecommendationsPage />);

    // Wait for streaming to finish and album to appear
    await waitFor(() => {
      expect(screen.getByTestId("album-album-1")).toBeInTheDocument();
    });

    // Click "Own" — should trigger the error path
    await user.click(screen.getByTestId("own-album-1"));

    // Error banner should appear
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Internal Server Error");
    });

    // Album should NOT be removed (action failed)
    expect(screen.getByTestId("album-album-1")).toBeInTheDocument();
  });

  it("shows an error banner when fetch throws a network error", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/recommendations/stream")) {
        return new Response(makeSSEStream([fakeAlbum]), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      throw new TypeError("Failed to fetch");
    });

    render(<RecommendationsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("album-album-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("wishlist-album-1"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to fetch");
    });

    // Album stays
    expect(screen.getByTestId("album-album-1")).toBeInTheDocument();
  });

  it("auto-dismisses the error banner after 4 seconds", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/recommendations/stream")) {
        return new Response(makeSSEStream([fakeAlbum]), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return new Response("Bad Request", { status: 400 });
    });

    render(<RecommendationsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("album-album-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("own-album-1"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Advance past the 4-second auto-dismiss
    act(() => {
      vi.advanceTimersByTime(4100);
    });

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("dismisses the error banner when the close button is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/recommendations/stream")) {
        return new Response(makeSSEStream([fakeAlbum]), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return new Response("Forbidden", { status: 403 });
    });

    render(<RecommendationsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("album-album-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("skip-album-1"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Click dismiss button
    await user.click(screen.getByLabelText("Dismiss error"));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("removes the album from the list on successful action", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockStreamOk([fakeAlbum]);

    render(<RecommendationsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("album-album-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("own-album-1"));

    await waitFor(() => {
      expect(screen.queryByTestId("album-album-1")).not.toBeInTheDocument();
    });

    // No error shown
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows error for modal actions on failure", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/recommendations/stream")) {
        return new Response(makeSSEStream([fakeAlbum]), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return new Response("Service Unavailable", { status: 503 });
    });

    render(<RecommendationsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("album-album-1")).toBeInTheDocument();
    });

    // Open modal by clicking album
    await user.click(screen.getByTestId("click-album-1"));

    await waitFor(() => {
      expect(screen.getByTestId("modal")).toBeInTheDocument();
    });

    // Try modal own action — should fail
    await user.click(screen.getByTestId("modal-own"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Service Unavailable");
    });

    // Modal should stay open (action failed), album still in list
    expect(screen.getByTestId("modal")).toBeInTheDocument();
    expect(screen.getByTestId("album-album-1")).toBeInTheDocument();
  });

  it("closes modal and removes album on successful modal action", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockStreamOk([fakeAlbum]);

    render(<RecommendationsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("album-album-1")).toBeInTheDocument();
    });

    // Open modal
    await user.click(screen.getByTestId("click-album-1"));
    await waitFor(() => {
      expect(screen.getByTestId("modal")).toBeInTheDocument();
    });

    // Click modal wishlist
    await user.click(screen.getByTestId("modal-wishlist"));

    await waitFor(() => {
      expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
      expect(screen.queryByTestId("album-album-1")).not.toBeInTheDocument();
    });
  });
});
