import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- Mocks ---

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, ...rest } = props;
    return <img {...rest} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/components/Navbar", () => ({
  default: () => <nav data-testid="navbar">Navbar</nav>,
}));

// We render the real AlbumGrid + AlbumCard so we get actual Remove buttons.
// No mock needed for those.

import CollectionPage from "@/app/collection/page";

// --- Helpers ---

function fakeAlbum(id: string, name: string, artist: string) {
  return { id, name, artist, imageUrl: `https://img/${id}` };
}

const collectionPayload = {
  owned: [fakeAlbum("o1", "OK Computer", "Radiohead")],
  wishlist: [fakeAlbum("w1", "Blue Album", "Weezer")],
};

function mockFetchForCollection(payload = collectionPayload) {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    // Collection GET
    if (typeof url === "string" && url.includes("/api/collection") && (!opts || opts.method !== "DELETE")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(payload),
      });
    }
    // DELETE fallback (override in individual tests)
    return Promise.resolve({ ok: true, status: 200 });
  });
}

// --- Tests ---

describe("CollectionPage – remove handlers", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPush.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("removes an album from the list on successful delete", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    global.fetch = mockFetchForCollection();

    render(<CollectionPage />);

    // Wait for collection to load
    await waitFor(() => expect(screen.getByText("OK Computer")).toBeInTheDocument());
    expect(screen.getByText("Blue Album")).toBeInTheDocument();

    // Click "Remove" on the first album (OK Computer – owned)
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);

    // Album should be removed from DOM
    await waitFor(() => expect(screen.queryByText("OK Computer")).not.toBeInTheDocument());

    // The DELETE fetch was called with the right albumId
    const deleteCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => {
        const [url, opts] = call as [string, RequestInit | undefined];
        return url.includes("albumId=o1") && opts?.method === "DELETE";
      }
    );
    expect(deleteCalls).toHaveLength(1);
  });

  it("shows an error banner when the API returns a non-200 response", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(collectionPayload),
      });
    });

    render(<CollectionPage />);

    await waitFor(() => expect(screen.getByText("OK Computer")).toBeInTheDocument());

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);

    // Error banner should appear
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toContain("Failed to remove");
      expect(alert.textContent).toContain("OK Computer");
    });

    // Album should NOT be removed from the list
    expect(screen.getByText("OK Computer")).toBeInTheDocument();
  });

  it("shows an error banner on network failure", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(collectionPayload),
      });
    });

    render(<CollectionPage />);

    await waitFor(() => expect(screen.getByText("Blue Album")).toBeInTheDocument());

    // Remove the wishlist album
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[1]);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toContain("Could not remove");
      expect(alert.textContent).toContain("Blue Album");
    });

    // Album should remain
    expect(screen.getByText("Blue Album")).toBeInTheDocument();
  });

  it("sets loading state (removingId) during removal", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    let resolveDelete: (v: unknown) => void;
    const deletePromise = new Promise((resolve) => {
      resolveDelete = resolve;
    });

    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") {
        return deletePromise;
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(collectionPayload),
      });
    });

    render(<CollectionPage />);

    await waitFor(() => expect(screen.getByText("OK Computer")).toBeInTheDocument());

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);

    // While removal is in-flight, the section should show reduced opacity
    await waitFor(() => {
      const ownedSection = screen.getByText("OK Computer").closest(".opacity-60");
      expect(ownedSection).toBeInTheDocument();
    });

    // Resolve the delete
    await act(async () => {
      resolveDelete!({ ok: true, status: 200 });
    });

    // Opacity class should be removed after completion
    await waitFor(() => {
      expect(screen.queryByText("OK Computer")).not.toBeInTheDocument();
    });
  });

  it("auto-dismisses the error banner after 5 seconds", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(collectionPayload),
      });
    });

    render(<CollectionPage />);

    await waitFor(() => expect(screen.getByText("OK Computer")).toBeInTheDocument());

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);

    // Error banner appears
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    // Advance time by 5 seconds
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Error banner should be gone
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("dismisses the error banner when the dismiss button is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(collectionPayload),
      });
    });

    render(<CollectionPage />);

    await waitFor(() => expect(screen.getByText("OK Computer")).toBeInTheDocument());

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    // Click dismiss
    const dismissBtn = screen.getByLabelText("Dismiss error");
    await user.click(dismissBtn);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
