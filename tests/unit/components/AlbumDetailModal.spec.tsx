import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AlbumDetailModal from "@/components/AlbumDetailModal";

// ── Mocks ────────────────────────────────────────────────────

// Mock next/image → plain <img>
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // next/image uses `fill` as boolean; translate to style for plain img
    const { fill, ...rest } = props;
    return <img {...rest} />;
  },
}));

// Global fetch mock
const mockFetch = vi.fn();
global.fetch = mockFetch;

// HTMLAudioElement mock
const mockPlay = vi.fn().mockResolvedValue(undefined);
const mockPause = vi.fn();
let audioInstances: Array<{
  play: typeof mockPlay;
  pause: typeof mockPause;
  volume: number;
  onended: (() => void) | null;
  src: string;
}>;

beforeEach(() => {
  audioInstances = [];
  vi.clearAllMocks();

  // Must use `function` (not arrow) so vitest can call it with `new`
  global.Audio = vi.fn().mockImplementation(function (this: Record<string, unknown>, src?: string) {
    this.play = mockPlay;
    this.pause = mockPause;
    this.volume = 1;
    this.onended = null;
    this.src = src ?? "";
    audioInstances.push(this as unknown as (typeof audioInstances)[0]);
  }) as unknown as typeof Audio;
});

// ── Helpers ──────────────────────────────────────────────────

const defaultProps = {
  albumId: "abc123",
  albumName: "OK Computer",
  artistName: "Radiohead",
  imageUrl: "https://example.com/ok-computer.jpg",
  isOpen: true,
  onClose: vi.fn(),
  onOwn: vi.fn(),
  onWishlist: vi.fn(),
  onSkip: vi.fn(),
  onNotInterested: vi.fn(),
};

function makeAlbumDetails(overrides: Record<string, unknown> = {}) {
  return {
    id: "abc123",
    name: "OK Computer",
    artist: "Radiohead",
    imageUrl: "https://example.com/ok-computer.jpg",
    releaseDate: "1997-06-16",
    totalTracks: 12,
    label: "Parlophone",
    spotifyUrl: "https://open.spotify.com/album/abc123",
    tracks: [
      {
        id: "t1",
        name: "Airbag",
        trackNumber: 1,
        durationMs: 284000,
        previewUrl: "https://preview.example.com/airbag.mp3",
        spotifyUrl: "https://open.spotify.com/track/t1",
        isTopTrack: true,
        topTrackRank: 5,
      },
      {
        id: "t2",
        name: "Paranoid Android",
        trackNumber: 2,
        durationMs: 383000,
        previewUrl: "https://preview.example.com/paranoid.mp3",
        spotifyUrl: "https://open.spotify.com/track/t2",
        isTopTrack: false,
        topTrackRank: null,
      },
      {
        id: "t3",
        name: "Lucky",
        trackNumber: 3,
        durationMs: 261000,
        previewUrl: null,
        spotifyUrl: "https://open.spotify.com/track/t3",
        isTopTrack: false,
        topTrackRank: null,
      },
    ],
    userStats: {
      topTracksFromAlbum: 1,
      mostListenedTrack: { id: "t1", name: "Airbag", rank: 5 },
      timeRange: "recent" as const,
    },
    discogs: {
      title: "OK Computer",
      year: "1997",
      label: "Parlophone",
      format: ["Vinyl", "LP", "Album"],
      thumb: "https://img.discogs.com/thumb.jpg",
      url: "https://www.discogs.com/release/123",
      totalResults: 42,
    },
    ...overrides,
  };
}

function renderModal(overrides: Partial<typeof defaultProps> = {}) {
  return render(<AlbumDetailModal {...defaultProps} {...overrides} />);
}

function mockFetchSuccess(data: ReturnType<typeof makeAlbumDetails>) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  });
}

function mockFetchError() {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({}),
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("AlbumDetailModal", () => {
  describe("rendering", () => {
    it("returns null when isOpen is false", () => {
      const { container } = renderModal({ isOpen: false });
      expect(container.firstChild).toBeNull();
    });

    it("renders modal with album name, artist, and image", async () => {
      const details = makeAlbumDetails();
      mockFetchSuccess(details);

      renderModal();

      expect(screen.getByText("OK Computer")).toBeInTheDocument();
      expect(screen.getByText("Radiohead")).toBeInTheDocument();

      const img = screen.getByAltText("OK Computer");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "https://example.com/ok-computer.jpg");
    });

    it("shows release year, track count, and label when details load", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      await waitFor(() => {
        expect(screen.getByText(/1997/)).toBeInTheDocument();
        expect(screen.getByText(/12 tracks/)).toBeInTheDocument();
      });

      // "Label: Parlophone" appears in both the header and discogs section
      const labelTexts = screen.getAllByText(/Label: Parlophone/);
      expect(labelTexts.length).toBeGreaterThanOrEqual(1);
    });

    it("shows user top track info when available", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      await waitFor(() => {
        expect(screen.getByText("Your Top Track")).toBeInTheDocument();
        expect(screen.getByText(/#5 Airbag/)).toBeInTheDocument();
        expect(screen.getByText(/Recent/)).toBeInTheDocument();
      });
    });
  });

  describe("loading state", () => {
    it("renders a spinner while fetching details", () => {
      // Keep the promise pending
      mockFetch.mockReturnValueOnce(new Promise(() => {}));
      renderModal();

      // The spinner has animate-spin class
      const spinner = document.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error message when fetch fails", async () => {
      mockFetchError();
      renderModal();

      await waitFor(() => {
        expect(
          screen.getByText("Failed to fetch album details")
        ).toBeInTheDocument();
      });
    });
  });

  describe("track list", () => {
    it("renders all tracks with correct names and numbers", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      await waitFor(() => {
        expect(screen.getByText("Airbag")).toBeInTheDocument();
      });

      expect(screen.getByText("Paranoid Android")).toBeInTheDocument();
      expect(screen.getByText("Lucky")).toBeInTheDocument();

      // Track numbers
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("formats track durations as m:ss", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      await waitFor(() => {
        // 284000ms = 4:44
        expect(screen.getByText("4:44")).toBeInTheDocument();
        // 383000ms = 6:23
        expect(screen.getByText("6:23")).toBeInTheDocument();
        // 261000ms = 4:21
        expect(screen.getByText("4:21")).toBeInTheDocument();
      });
    });

    it("highlights top tracks with rank badge", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      await waitFor(() => {
        expect(screen.getByText(/#5 in your top/)).toBeInTheDocument();
      });
    });

    it("shows 'Previews unavailable' when no tracks have previews", async () => {
      const details = makeAlbumDetails({
        tracks: [
          {
            id: "t1",
            name: "Airbag",
            trackNumber: 1,
            durationMs: 284000,
            previewUrl: null,
            spotifyUrl: "https://open.spotify.com/track/t1",
            isTopTrack: false,
            topTrackRank: null,
          },
        ],
      });
      mockFetchSuccess(details);
      renderModal();

      await waitFor(() => {
        expect(screen.getByText("Previews unavailable")).toBeInTheDocument();
      });
    });

    it("shows 'Listen on Spotify' callout when no previews available", async () => {
      const details = makeAlbumDetails({
        tracks: [
          {
            id: "t1",
            name: "Airbag",
            trackNumber: 1,
            durationMs: 284000,
            previewUrl: null,
            spotifyUrl: "https://open.spotify.com/track/t1",
            isTopTrack: false,
            topTrackRank: null,
          },
        ],
      });
      mockFetchSuccess(details);
      renderModal();

      await waitFor(() => {
        expect(
          screen.getByText("Track previews aren't available for this album")
        ).toBeInTheDocument();
      });
    });
  });

  describe("audio preview", () => {
    it("plays audio when clicking a track with a preview URL", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      await waitFor(() => {
        expect(screen.getByText("Airbag")).toBeInTheDocument();
      });

      const playBtn = screen.getByRole("button", {
        name: /Play preview of Airbag/,
      });
      fireEvent.click(playBtn);

      expect(global.Audio).toHaveBeenCalledWith(
        "https://preview.example.com/airbag.mp3"
      );
      expect(mockPlay).toHaveBeenCalled();
      // Volume is set after construction
      expect(audioInstances[0]?.volume).toBe(0.5);
    });

    it("pauses audio when clicking the same track again", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      await waitFor(() => {
        expect(screen.getByText("Airbag")).toBeInTheDocument();
      });

      const playBtn = screen.getByRole("button", {
        name: /Play preview of Airbag/,
      });

      // First click → play
      fireEvent.click(playBtn);
      expect(mockPlay).toHaveBeenCalledTimes(1);

      // Second click → pause (button label changes to "Pause preview")
      const pauseBtn = screen.getByRole("button", {
        name: /Pause preview of Airbag/,
      });
      fireEvent.click(pauseBtn);
      expect(mockPause).toHaveBeenCalled();
    });

    it("switches to a new track when clicking a different track", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      await waitFor(() => {
        expect(screen.getByText("Airbag")).toBeInTheDocument();
      });

      // Play first track
      fireEvent.click(
        screen.getByRole("button", { name: /Play preview of Airbag/ })
      );
      expect(mockPlay).toHaveBeenCalledTimes(1);

      // Play second track
      fireEvent.click(
        screen.getByRole("button", {
          name: /Play preview of Paranoid Android/,
        })
      );

      // Should have paused old + created new audio
      expect(mockPause).toHaveBeenCalled();
      expect(global.Audio).toHaveBeenCalledWith(
        "https://preview.example.com/paranoid.mp3"
      );
      expect(mockPlay).toHaveBeenCalledTimes(2);
    });

    it("disables play button for tracks without preview URL", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      await waitFor(() => {
        expect(screen.getByText("Lucky")).toBeInTheDocument();
      });

      const btn = screen.getByRole("button", {
        name: /Play preview of Lucky/,
      });
      expect(btn).toBeDisabled();
    });
  });

  describe("Discogs vinyl section", () => {
    it("renders vinyl info when discogs data is available", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      await waitFor(() => {
        expect(screen.getByText("Vinyl Info")).toBeInTheDocument();
      });

      expect(screen.getByText(/Vinyl, LP, Album/)).toBeInTheDocument();
      // Discogs label rendered in the vinyl info section (also appears in header)
      const discogsLabel = screen.getAllByText(/Label: Parlophone/);
      expect(discogsLabel.length).toBe(2); // header + discogs section
      expect(
        screen.getByText("42 vinyl releases found")
      ).toBeInTheDocument();

      const discogsLink = screen.getByText("View on Discogs");
      expect(discogsLink).toHaveAttribute(
        "href",
        "https://www.discogs.com/release/123"
      );
    });

    it("does not render vinyl section when discogs is null", async () => {
      mockFetchSuccess(makeAlbumDetails({ discogs: null }));
      renderModal();

      await waitFor(() => {
        expect(screen.getByText("Tracks")).toBeInTheDocument();
      });

      expect(screen.queryByText("Vinyl Info")).not.toBeInTheDocument();
    });
  });

  describe("action buttons", () => {
    it("calls onOwn when 'Own it' is clicked", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      fireEvent.click(screen.getByText("Own it"));
      expect(defaultProps.onOwn).toHaveBeenCalledTimes(1);
    });

    it("calls onWishlist when 'Wishlist' is clicked", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      fireEvent.click(screen.getByText("Wishlist"));
      expect(defaultProps.onWishlist).toHaveBeenCalledTimes(1);
    });

    it("calls onSkip when 'Skip' is clicked", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      fireEvent.click(screen.getByText("Skip"));
      expect(defaultProps.onSkip).toHaveBeenCalledTimes(1);
    });

    it("calls onNotInterested when 'Never show' is clicked", async () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      fireEvent.click(screen.getByText("Never show this album again"));
      expect(defaultProps.onNotInterested).toHaveBeenCalledTimes(1);
    });
  });

  describe("close behavior", () => {
    it("calls onClose when close button is clicked", () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      const closeBtn = screen.getByRole("button", { name: /close/i });
      fireEvent.click(closeBtn);
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when backdrop is clicked", () => {
      mockFetchSuccess(makeAlbumDetails());
      const { container } = renderModal();

      // Backdrop is the first absolute div inside the fixed wrapper
      const backdrop = container.querySelector(".bg-black\\/80");
      expect(backdrop).toBeInTheDocument();
      fireEvent.click(backdrop!);
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape key is pressed", () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      const dialog = screen.getByRole("dialog");
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("ARIA attributes", () => {
    it("has role=dialog on the modal", () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
    });

    it("has aria-modal=true", () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("has aria-labelledby pointing to the album title", () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-labelledby", "modal-album-title");

      const title = document.getElementById("modal-album-title");
      expect(title).toBeInTheDocument();
      expect(title?.textContent).toBe("OK Computer");
    });
  });

  describe("fetch behavior", () => {
    it("fetches album details when opened", () => {
      mockFetchSuccess(makeAlbumDetails());
      renderModal();

      expect(mockFetch).toHaveBeenCalledWith("/api/album/abc123");
    });

    it("does not fetch when modal is closed", () => {
      renderModal({ isOpen: false });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
