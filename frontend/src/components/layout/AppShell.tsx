import {
  BarChart3,
  Building2,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  Sun,
  Upload,
  User as UserIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { useAuth, useBusiness, useTheme } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/reviews", label: "Reviews", icon: BarChart3 },
  { to: "/ask", label: "Ask AI", icon: MessageSquareText },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/uploads", label: "History", icon: History },
  { to: "/businesses", label: "Businesses", icon: Building2 },
];

export function Logo() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2 font-bold tracking-tight">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-md shadow-primary/30">
        R
      </span>
      <span className="text-lg">
        Review<span className="text-gradient">Lens</span>
      </span>
    </Link>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { businesses, current, select } = useBusiness();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              isActive && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="no-print fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card/60 px-4 py-5 backdrop-blur lg:flex">
        <Logo />
        <div className="mt-8 flex-1">{nav}</div>
        <div className="space-y-1 border-t pt-4">
          <NavLink
            to="/profile"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <UserIcon className="h-4 w-4" />
            <span className="truncate">{user?.full_name || user?.email}</span>
          </NavLink>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="h-full w-64 bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <Logo />
            <div className="mt-6">{nav}</div>
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu />
            <span className="sr-only">Open menu</span>
          </Button>
          <div className="flex items-center gap-2">
            <Building2 className="hidden h-4 w-4 text-muted-foreground sm:block" />
            {businesses.length > 0 ? (
              <Select
                aria-label="Current business"
                value={current?.id ?? ""}
                onChange={(e) => select(Number(e.target.value))}
                className="h-9 w-48 sm:w-60"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-sm text-muted-foreground">No business yet</span>
            )}
          </div>
          <div className="ml-auto">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
