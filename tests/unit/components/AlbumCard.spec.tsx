import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AlbumCard, { Album, ListeningStats } from "@/components/AlbumCard";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, ...rest } = props;
    return <img {...rest} data-fill={fill ? "true" : undefined} />;
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
const makeAlbum = (overrides?: Partial<Album>): Album => ({
  id: "1",
  name: "OK Computer",
  artist: "Radiohead",
  imageUrl: "https://img.example.com/ok.jpg",
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe("AlbumCard", () => {
  // ── Basic rendering ──────────────────────────────────────────────────────
  it("renders album name, artist, and image", () => {
    render(<AlbumCard album={makeAlbum()} />);

    expect(screen.getByText("OK Computer")).toBeInTheDocument();
    expect(screen.getByText("Radiohead")).toBeInTheDocument();
    expect(
      screen.getByAltText("OK Computer by Radiohead"),
    ).toBeInTheDocument();
  });

  it("renders placeholder when imageUrl is empty", () => {
    render(<AlbumCard album={makeAlbum({ imageUrl: "" })} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  // ── Action buttons visibility ────────────────────────────────────────────
  it("shows Own it button when onOwn handler is provided", () => {
    render(<AlbumCard album={makeAlbum()} onOwn={vi.fn()} />);
    expect(screen.getByText("Own it")).toBeInTheDocument();
  });

  it("shows Wishlist button when onWishlist handler is provided", () => {
    render(<AlbumCard album={makeAlbum()} onWishlist={vi.fn()} />);
    expect(screen.getByText("Wishlist")).toBeInTheDocument();
  });

  it("shows Skip button when onSkip handler is provided", () => {
    render(<AlbumCard album={makeAlbum()} onSkip={vi.fn()} />);
    expect(screen.getByLabelText("Skip this album")).toBeInTheDocument();
  });

  it("shows Remove button when onRemove handler is provided", () => {
    render(<AlbumCard album={makeAlbum()} onRemove={vi.fn()} />);
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("shows Restore button when onRestore handler is provided", () => {
    render(<AlbumCard album={makeAlbum()} onRestore={vi.fn()} />);
    expect(screen.getByText("Restore to recommendations")).toBeInTheDocument();
  });

  it("hides action buttons when showActions is false", () => {
    render(
      <AlbumCard
        album={makeAlbum()}
        showActions={false}
        onOwn={vi.fn()}
        onWishlist={vi.fn()}
        onRemove={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.queryByText("Own it")).not.toBeInTheDocument();
    expect(screen.queryByText("Wishlist")).not.toBeInTheDocument();
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Restore to recommendations"),
    ).not.toBeInTheDocument();
  });

  // ── Click / keyboard handlers ────────────────────────────────────────────
  it("calls onClick when the card is clicked", async () => {
    const onClick = vi.fn();
    const album = makeAlbum();
    render(<AlbumCard album={album} onClick={onClick} />);

    await userEvent.click(screen.getByRole("button")); // role=button set when onClick exists
    expect(onClick).toHaveBeenCalledWith(album);
  });

  it("calls onClick on Enter key", () => {
    const onClick = vi.fn();
    const album = makeAlbum();
    render(<AlbumCard album={album} onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onClick).toHaveBeenCalledWith(album);
  });

  it("calls onClick on Space key", () => {
    const onClick = vi.fn();
    const album = makeAlbum();
    render(<AlbumCard album={album} onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole("button"), { key: " " });
    expect(onClick).toHaveBeenCalledWith(album);
  });

  it("does not set role=button when no onClick provided", () => {
    render(<AlbumCard album={makeAlbum()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // ── Loading state ────────────────────────────────────────────────────────
  it("disables buttons while an action is in-flight", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const onOwn = vi.fn(() => pending);
    const onWishlist = vi.fn();

    render(
      <AlbumCard album={makeAlbum()} onOwn={onOwn} onWishlist={onWishlist} />,
    );

    // Click Own it — starts loading
    fireEvent.click(screen.getByText("Own it"));

    // Both buttons should be disabled while loading
    expect(screen.getByText("Own it")).toBeDisabled();
    expect(screen.getByText("Wishlist")).toBeDisabled();

    // Resolve the action
    resolve();
    await waitFor(() => {
      expect(screen.getByText("Own it")).not.toBeDisabled();
    });
  });

  // ── Action handlers fire correctly ───────────────────────────────────────
  it("calls onOwn when Own it button is clicked", async () => {
    const onOwn = vi.fn();
    const album = makeAlbum();
    render(<AlbumCard album={album} onOwn={onOwn} />);

    fireEvent.click(screen.getByText("Own it"));
    await waitFor(() => expect(onOwn).toHaveBeenCalledWith(album));
  });

  it("calls onRemove when Remove button is clicked", async () => {
    const onRemove = vi.fn();
    const album = makeAlbum();
    render(<AlbumCard album={album} onRemove={onRemove} />);

    fireEvent.click(screen.getByText("Remove"));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(album));
  });

  it("calls onSkip when Skip button is clicked", async () => {
    const onSkip = vi.fn();
    const album = makeAlbum();
    render(<AlbumCard album={album} onSkip={onSkip} />);

    fireEvent.click(screen.getByLabelText("Skip this album"));
    await waitFor(() => expect(onSkip).toHaveBeenCalledWith(album));
  });

  // ── Listening stats banner ───────────────────────────────────────────────
  describe("listening stats banner", () => {
    it("renders ranked banner for a single top-track", () => {
      const stats: ListeningStats = {
        topTracksCount: 1,
        highestRank: 5,
        trackName: "Paranoid Android",
        recentlyPlayed: false,
        timeRange: "all-time",
      };
      render(<AlbumCard album={makeAlbum()} listeningStats={stats} />);

      expect(screen.getByText("#5")).toBeInTheDocument();
      expect(screen.getByText("All-time")).toBeInTheDocument();
    });

    it("renders multi-track banner", () => {
      const stats: ListeningStats = {
        topTracksCount: 3,
        highestRank: 10,
        trackName: "Karma Police",
        recentlyPlayed: false,
        timeRange: "recent",
      };
      render(<AlbumCard album={makeAlbum()} listeningStats={stats} />);

      expect(screen.getByText("3 top")).toBeInTheDocument();
      expect(screen.getByText("Recent")).toBeInTheDocument();
    });

    it("renders recently-played banner when no top tracks", () => {
      const stats: ListeningStats = {
        topTracksCount: 0,
        highestRank: null,
        trackName: null,
        recentlyPlayed: true,
        timeRange: "recent",
      };
      render(<AlbumCard album={makeAlbum()} listeningStats={stats} />);

      expect(screen.getByText("Played")).toBeInTheDocument();
      expect(screen.getByText("Recently")).toBeInTheDocument();
    });

    it("renders no banner when stats produce null", () => {
      const stats: ListeningStats = {
        topTracksCount: 0,
        highestRank: null,
        trackName: null,
        recentlyPlayed: false,
        timeRange: "recent",
      };
      render(<AlbumCard album={makeAlbum()} listeningStats={stats} />);

      expect(screen.queryByText("Played")).not.toBeInTheDocument();
      expect(screen.queryByText("#")).not.toBeInTheDocument();
    });

    it("highlights banner when rank ≤ 15", () => {
      const stats: ListeningStats = {
        topTracksCount: 1,
        highestRank: 10,
        trackName: "Airbag",
        recentlyPlayed: false,
        timeRange: "recent",
      };
      const { container } = render(
        <AlbumCard album={makeAlbum()} listeningStats={stats} />,
      );

      const bannerDiv = container.querySelector(".bg-spotify-green");
      expect(bannerDiv).toBeInTheDocument();
    });

    it("does not highlight banner when rank > 15 and single track", () => {
      const stats: ListeningStats = {
        topTracksCount: 1,
        highestRank: 30,
        trackName: "Lucky",
        recentlyPlayed: false,
        timeRange: "all-time",
      };
      const { container } = render(
        <AlbumCard album={makeAlbum()} listeningStats={stats} />,
      );

      const greenBanner = container.querySelector(".bg-spotify-green");
      expect(greenBanner).not.toBeInTheDocument();
      const greyBanner = container.querySelector(".bg-zinc-700");
      expect(greyBanner).toBeInTheDocument();
    });

    it("highlights banner when multiple tracks even if rank > 15", () => {
      const stats: ListeningStats = {
        topTracksCount: 2,
        highestRank: 40,
        trackName: "Karma Police",
        recentlyPlayed: false,
        timeRange: "all-time",
      };
      const { container } = render(
        <AlbumCard album={makeAlbum()} listeningStats={stats} />,
      );

      const bannerDiv = container.querySelector(".bg-spotify-green");
      expect(bannerDiv).toBeInTheDocument();
    });
  });
});
