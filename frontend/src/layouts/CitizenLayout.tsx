import React, { useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FilePlus2,
  FileText,
  MapPin,
  Bell,
  User,
  LogOut,
  Waves,
  Menu,
  X,
  ShieldCheck,
  Mic,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { CopyrightFooter } from "../components/layout/CopyrightFooter";

const CITIZEN_NAV = [
  { id: "dashboard", label: "Dashboard", path: "/citizen/dashboard", icon: LayoutDashboard },
  { id: "report", label: "Report Pollution", path: "/citizen/report", icon: FilePlus2 },
  { id: "my-reports", label: "My Reports", path: "/citizen/my-reports", icon: FileText },
  { id: "map", label: "Pollution Map", path: "/citizen/map", icon: MapPin },
  { id: "alerts", label: "Alerts", path: "/citizen/alerts", icon: Bell },
  { id: "voice", label: "Voice Assistant", path: "/citizen/voice", icon: Mic },
  { id: "profile", label: "Profile", path: "/citizen/profile", icon: User },
];

export const CitizenLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F9FD] dark:bg-[#071521] text-[#17324D] dark:text-[#EAF6FF]">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar for Citizen */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-[#0c1f33] border-r border-[#D9E8F2] dark:border-[#1a3854] flex flex-col transition-transform duration-300 md:static md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b border-[#D9E8F2] dark:border-[#1a3854] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0066b2] flex items-center justify-center text-white shadow-sm">
              <Waves className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-black tracking-widest text-[#0066b2] dark:text-[#00f3ff] uppercase">
                CITIZEN PORTAL
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                Marine Pollution Surveillance
              </p>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1 rounded-lg text-slate-400 md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-3.5 mx-3 mt-3 rounded-xl bg-[#F0F7FC] dark:bg-[#0e2740] border border-[#D9E8F2] dark:border-[#1f4263] flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#0066b2] text-white flex items-center justify-center font-bold text-xs shrink-0">
            {user?.name ? user.name.slice(0, 2).toUpperCase() : "CZ"}
          </div>
          <div className="overflow-hidden flex-1">
            <p className="text-xs font-bold truncate text-[#17324D] dark:text-white">
              {user?.name || "Citizen Reporter"}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {user?.email || "citizen@marine.org"}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {CITIZEN_NAV.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.id}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? "bg-[#EAF6FF] dark:bg-[#12385c] text-[#0066b2] dark:text-[#00f3ff] font-bold border-l-4 border-[#0066b2] dark:border-[#00f3ff]"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-[#0066b2] dark:text-[#00f3ff]" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Citizen Advisory Note */}
        <div className="p-3 mx-3 mb-3 rounded-xl bg-[#EAF8F4] dark:bg-[#062920] border border-[#9ADBC8] dark:border-[#0e5c46] text-[11px] text-[#087F68] dark:text-emerald-300 space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Public Incident Channel</span>
          </div>
          <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
            Reports assist Coast Guard MRCC with rapid visual verification.
          </p>
        </div>

        {/* Logout */}
        <div className="p-3 border-t border-[#D9E8F2] dark:border-[#1a3854]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile Header Bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-[#0c1f33] border-b border-[#D9E8F2] dark:border-[#1a3854]">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1 rounded-lg text-slate-600 dark:text-slate-300"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="text-xs font-black tracking-widest text-[#0066b2] dark:text-[#00f3ff]">
            CITIZEN GUARDIAN
          </span>
          <button onClick={handleLogout} className="p-1 text-red-500">
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
        <CopyrightFooter />
      </div>
    </div>
  );
};
