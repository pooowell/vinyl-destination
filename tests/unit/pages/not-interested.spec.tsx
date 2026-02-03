import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, ...rest } = props;
    return <img {...rest} data-fill={fill ? "true" : undefined} />;
  },
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock Navbar
vi.mock("@/components/Navbar", () => ({
  default: () => <nav data-testid="navbar">Navbar</nav>,
}));

import NotInterestedPage from "@/app/collection/not-interested/page";

const mockAlbums = [
  { id: "1", name: "Album One", artist: "Artist A", imageUrl: "https://img/1" },
  { id: "2", name: "Album Two", artist: "Artist B", imageUrl: "https://img/2" },
];

function mockFetchSuccess() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ notInterested: mockAlbums }),
  });
}

describe("NotInterestedPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPush.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders albums from the API", async () => {
    global.fetch = mockFetchSuccess();

    render(<NotInterestedPage />);

    await waitFor(() => {
      expect(screen.getByText("Album One")).toBeInTheDocument();
      expect(screen.getByText("Album Two")).toBeInTheDocument();
    });
  });

  it("shows error banner on failed restore", async () => {
    // First call: fetch albums (success). Second call: restore (fail).
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ notInterested: mockAlbums }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NotInterestedPage />);

    // Wait for albums to load
    await waitFor(() => {
      expect(screen.getByText("Album One")).toBeInTheDocument();
    });

    // Click the restore button on the first album
    const restoreButtons = screen.getAllByRole("button", {
      name: /restore to recommendations/i,
    });
    await user.click(restoreButtons[0]);

    // Error banner should appear
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Failed to restore album")).toBeInTheDocument();
    });

    // Album should still be in the list (not removed)
    expect(screen.getByText("Album One")).toBeInTheDocument();
  });

  it("shows loading state during restore", async () => {
    let resolveRestore: (value: unknown) => void;
    const restorePromise = new Promise((resolve) => {
      resolveRestore = resolve;
    });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ notInterested: mockAlbums }),
      })
      .mockReturnValueOnce(restorePromise);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NotInterestedPage />);

    // Wait for albums to load
    await waitFor(() => {
      expect(screen.getByText("Album One")).toBeInTheDocument();
    });

    // Click restore on the first album
    const restoreButtons = screen.getAllByRole("button", {
      name: /restore to recommendations/i,
    });
    await user.click(restoreButtons[0]);

    // The button should be disabled while loading (AlbumCard sets isLoading)
    await waitFor(() => {
      expect(restoreButtons[0]).toBeDisabled();
    });

    // Resolve the fetch to clean up
    await act(async () => {
      resolveRestore!({ ok: true, status: 200 });
    });
  });

  it("removes album from list on successful restore", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ notInterested: mockAlbums }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NotInterestedPage />);

    // Wait for albums to load
    await waitFor(() => {
      expect(screen.getByText("Album One")).toBeInTheDocument();
      expect(screen.getByText("Album Two")).toBeInTheDocument();
    });

    // Click restore on the first album
    const restoreButtons = screen.getAllByRole("button", {
      name: /restore to recommendations/i,
    });
    await user.click(restoreButtons[0]);

    // Album One should be removed, Album Two should remain
    await waitFor(() => {
      expect(screen.queryByText("Album One")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Album Two")).toBeInTheDocument();
  });

  it("auto-dismisses error banner after 5 seconds", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ notInterested: mockAlbums }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NotInterestedPage />);

    // Wait for albums to load
    await waitFor(() => {
      expect(screen.getByText("Album One")).toBeInTheDocument();
    });

    // Click restore to trigger error
    const restoreButtons = screen.getAllByRole("button", {
      name: /restore to recommendations/i,
    });
    await user.click(restoreButtons[0]);

    // Error banner should appear
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Advance time by 5 seconds
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Error banner should be gone
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("allows manual dismissal of error banner", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ notInterested: mockAlbums }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NotInterestedPage />);

    await waitFor(() => {
      expect(screen.getByText("Album One")).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByRole("button", {
      name: /restore to recommendations/i,
    });
    await user.click(restoreButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Click the dismiss button
    const dismissButton = screen.getByRole("button", {
      name: /dismiss error/i,
    });
    await user.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
