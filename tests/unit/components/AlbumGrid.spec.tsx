import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AlbumGrid from "@/components/AlbumGrid";
import { Album } from "@/components/AlbumCard";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, ...rest } = props;
    return <img {...rest} data-fill={fill ? "true" : undefined} />;
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
const makeAlbums = (count: number): Album[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: `Album ${i + 1}`,
    artist: `Artist ${i + 1}`,
    imageUrl: `https://img.example.com/${i + 1}.jpg`,
  }));

// ── Tests ────────────────────────────────────────────────────────────────────
describe("AlbumGrid", () => {
  it("renders the correct number of album cards", () => {
    const albums = makeAlbums(5);
    render(<AlbumGrid albums={albums} />);

    for (const album of albums) {
      expect(screen.getByText(album.name)).toBeInTheDocument();
      expect(screen.getByText(album.artist)).toBeInTheDocument();
    }
  });

  it("shows default empty message when no albums", () => {
    render(<AlbumGrid albums={[]} />);
    expect(screen.getByText("No albums found")).toBeInTheDocument();
  });

  it("shows custom empty message", () => {
    render(
      <AlbumGrid albums={[]} emptyMessage="Your collection is empty" />,
    );
    expect(
      screen.getByText("Your collection is empty"),
    ).toBeInTheDocument();
  });

  it("does not show empty message when albums exist", () => {
    render(<AlbumGrid albums={makeAlbums(1)} />);
    expect(screen.queryByText("No albums found")).not.toBeInTheDocument();
  });

  it("passes onOwn handler through to AlbumCard", async () => {
    const albums = makeAlbums(1);
    const onOwn = vi.fn();
    render(<AlbumGrid albums={albums} onOwn={onOwn} />);

    fireEvent.click(screen.getByText("Own it"));
    await waitFor(() => expect(onOwn).toHaveBeenCalledWith(albums[0]));
  });

  it("passes onWishlist handler through to AlbumCard", async () => {
    const albums = makeAlbums(1);
    const onWishlist = vi.fn();
    render(<AlbumGrid albums={albums} onWishlist={onWishlist} />);

    fireEvent.click(screen.getByText("Wishlist"));
    await waitFor(() => expect(onWishlist).toHaveBeenCalledWith(albums[0]));
  });

  it("passes onRemove handler through to AlbumCard", async () => {
    const albums = makeAlbums(1);
    const onRemove = vi.fn();
    render(<AlbumGrid albums={albums} onRemove={onRemove} />);

    fireEvent.click(screen.getByText("Remove"));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(albums[0]));
  });

  it("passes onRestore handler through to AlbumCard", async () => {
    const albums = makeAlbums(1);
    const onRestore = vi.fn();
    render(<AlbumGrid albums={albums} onRestore={onRestore} />);

    fireEvent.click(screen.getByText("Restore to recommendations"));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(albums[0]));
  });

  it("passes onClick handler through to AlbumCard", async () => {
    const albums = makeAlbums(1);
    const onClick = vi.fn();
    render(<AlbumGrid albums={albums} onClick={onClick} />);

    // When onClick is provided, the card gets role=button
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledWith(albums[0]);
  });

  it("hides actions when showActions is false", () => {
    render(
      <AlbumGrid
        albums={makeAlbums(1)}
        showActions={false}
        onOwn={vi.fn()}
        onWishlist={vi.fn()}
      />,
    );

    expect(screen.queryByText("Own it")).not.toBeInTheDocument();
    expect(screen.queryByText("Wishlist")).not.toBeInTheDocument();
  });
});
