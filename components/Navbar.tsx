"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  const navLinks = [
    { href: "/recommendations", label: "Recommendations" },
    { href: "/collection", label: "My Collection" },
  ];

  return (
    <nav className="bg-black border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/recommendations" className="flex items-center gap-2">
              <svg
                className="w-8 h-8 text-spotify-green"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
              </svg>
              <span className="text-white font-bold text-xl">
                Vinyl Destination
              </span>
            </Link>

            <div className="hidden sm:flex ml-10 gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="text-zinc-400 hover:text-white text-sm font-medium transition-colors"
          >
            Log out
          </button>
        </div>

        {/* Mobile navigation */}
        <div className="sm:hidden pb-3 flex gap-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex-1 text-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                pathname === link.href
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
