"use client";

import AlbumCard, { Album, ListeningStats } from "./AlbumCard";

interface AlbumWithStats extends Album {
  listeningStats?: ListeningStats;
}

interface AlbumGridProps<T extends Album> {
  albums: T[];
  showActions?: boolean;
  onClick?: (album: T) => void;
  onOwn?: (album: T) => void;
  onWishlist?: (album: T) => void;
  onSkip?: (album: T) => void;
  onRemove?: (album: T) => void;
  onRestore?: (album: T) => void;
  emptyMessage?: string;
}

export default function AlbumGrid<T extends Album>({
  albums,
  showActions = true,
  onClick,
  onOwn,
  onWishlist,
  onSkip,
  onRemove,
  onRestore,
  emptyMessage = "No albums found",
}: AlbumGridProps<T>) {
  if (albums.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-400 text-lg">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {albums.map((album) => (
        <AlbumCard
          key={album.id}
          album={album}
          showActions={showActions}
          listeningStats={(album as AlbumWithStats).listeningStats}
          onClick={onClick ? () => onClick(album) : undefined}
          onOwn={onOwn ? () => onOwn(album) : undefined}
          onWishlist={onWishlist ? () => onWishlist(album) : undefined}
          onSkip={onSkip ? () => onSkip(album) : undefined}
          onRemove={onRemove ? () => onRemove(album) : undefined}
          onRestore={onRestore ? () => onRestore(album) : undefined}
        />
      ))}
    </div>
  );
}
