import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Navbar from "@/components/Navbar";

// ── Mocks ────────────────────────────────────────────────────────────────────
const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/recommendations"),
  useRouter: vi.fn(() => ({
    push: pushMock,
    refresh: refreshMock,
  })),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

// Access the mock so we can change pathname per-test
import { usePathname } from "next/navigation";
const usePathnameMock = vi.mocked(usePathname);

beforeEach(() => {
  usePathnameMock.mockReturnValue("/recommendations");
  pushMock.mockReset();
  refreshMock.mockReset();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Navbar", () => {
  it("renders the logo text", () => {
    render(<Navbar />);
    expect(screen.getByText("Vinyl Destination")).toBeInTheDocument();
  });

  it("renders Recommendations and My Collection nav links", () => {
    render(<Navbar />);

    // Desktop + mobile = 2 of each link
    const recoLinks = screen.getAllByText("Recommendations");
    const collLinks = screen.getAllByText("My Collection");
    expect(recoLinks.length).toBeGreaterThanOrEqual(2);
    expect(collLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("applies active class to Recommendations link when pathname matches", () => {
    usePathnameMock.mockReturnValue("/recommendations");
    render(<Navbar />);

    const links = screen.getAllByText("Recommendations");
    // At least one should have the active class
    const hasActive = links.some((link) =>
      link.className.includes("bg-zinc-800"),
    );
    expect(hasActive).toBe(true);
  });

  it("applies active class to My Collection link when pathname matches", () => {
    usePathnameMock.mockReturnValue("/collection");
    render(<Navbar />);

    const links = screen.getAllByText("My Collection");
    const hasActive = links.some((link) =>
      link.className.includes("bg-zinc-800"),
    );
    expect(hasActive).toBe(true);
  });

  it("does not apply active class to non-matching link", () => {
    usePathnameMock.mockReturnValue("/recommendations");
    render(<Navbar />);

    const collLinks = screen.getAllByText("My Collection");
    // All "My Collection" links should have the inactive class text-zinc-300
    const allInactive = collLinks.every((link) =>
      link.className.includes("text-zinc-300"),
    );
    expect(allInactive).toBe(true);
  });

  it("renders Log out button", () => {
    render(<Navbar />);
    expect(screen.getByText("Log out")).toBeInTheDocument();
  });

  it("calls logout API and navigates on Log out click", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    render(<Navbar />);
    fireEvent.click(screen.getByText("Log out"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/auth/logout", {
        method: "POST",
      });
    });

    expect(pushMock).toHaveBeenCalledWith("/");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("logo links to /recommendations", () => {
    render(<Navbar />);
    const logo = screen.getByText("Vinyl Destination").closest("a");
    expect(logo).toHaveAttribute("href", "/recommendations");
  });
});
