import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  AlertTriangle,
  ScanSearch,
  ListOrdered,
  Map,
  BarChart3,
  Waves,
  Boxes,
  FileText,
  ChevronLeft,
  ChevronRight,
  X,
  BellRing,
  Bot,
  Ship,
  RotateCcw,
  FileCheck,
  Users,
  Settings,
  Mic,
  Trash2,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  id: string;
  label: string;
  path: string;
  Icon: React.ElementType;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  // ── Command Center ──
  { id: "dashboard",     label: "Command Center",   path: "/admin/dashboard",     Icon: LayoutDashboard },

  // ── Module 1: Oil Spill Operations (Preserved) ──
  { id: "incidents",     label: "Oil Spills Queue",  path: "/incidents",           Icon: AlertTriangle,  badge: "Oil" },
  { id: "detect",        label: "AI Spill Detect",  path: "/detect",              Icon: ScanSearch,     badge: "SAR" },
  { id: "ais",           label: "AIS Tracking",     path: "/admin/ais",           Icon: Ship,           badge: "Sim" },
  { id: "investigation", label: "Vessel Ranking",   path: "/admin/investigation", Icon: Ship,           badge: "AI" },
  { id: "hindcasting",   label: "Hindcast Origin",  path: "/admin/hindcasting",   Icon: RotateCcw },
  { id: "drift",         label: "Forward Drift",    path: "/admin/drift",         Icon: Waves },

  // ── Module 2: Marine Waste & Debris (New Module) ──
  { id: "waste-command", label: "Marine Waste Desk", path: "/admin/waste",        Icon: Trash2,         badge: "New" },
  { id: "waste-detect",  label: "AI Waste Detect",  path: "/detect-waste",        Icon: ScanSearch,     badge: "Vision" },

  // ── Shared Spatial, Alerts & Response ──
  { id: "map",           label: "Map Operations",   path: "/map",                 Icon: Map },
  { id: "reports",       label: "Citizen Reports",  path: "/admin/reports",       Icon: FileText,       badge: "Triage" },
  { id: "alerts",        label: "Emergency Alerts", path: "/admin/alerts",        Icon: BellRing },
  { id: "evidence",      label: "Evidence Dossier", path: "/admin/evidence",      Icon: FileCheck },
  { id: "users",         label: "User Governance",  path: "/admin/users",         Icon: Users },
  { id: "priority",      label: "Priority Dispatch", path: "/priority",           Icon: ListOrdered },
  { id: "risk",          label: "Risk Studio",      path: "/risk",                Icon: BarChart3 },
  { id: "resources",     label: "Resource Hub",     path: "/resources",           Icon: Boxes },
  { id: "simulator",     label: "What-If Simulator", path: "/simulator",          Icon: Waves },
  { id: "assistant",     label: "AI Assistant",     path: "/assistant",           Icon: Bot },
  { id: "voice",         label: "Voice Assistant", path: "/admin/voice",         Icon: Mic,           badge: "22 Lang" },
  { id: "settings",      label: "System Settings",  path: "/admin/settings",      Icon: Settings },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-[#17324D]/40 backdrop-blur-sm z-40 md:hidden animate-fade-in"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Component */}
      <aside
        className={`glass-sidebar flex flex-col h-screen fixed inset-y-0 left-0 z-50 md:sticky md:top-0 transition-all duration-300 ${
          mobileOpen ? "translate-x-0 w-64 shadow-2xl" : "-translate-x-full md:translate-x-0"
        } ${collapsed ? "md:w-16" : "md:w-60"}`}
        aria-label="Sidebar navigation"
      >
        {/* Logo & Header */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-[#D9E8F2]">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#1268B3] flex items-center justify-center shadow-sm">
              <Waves className="w-5 h-5 text-white" />
            </div>
            {(!collapsed || mobileOpen) && (
              <div className="animate-fade-in overflow-hidden">
                <p className="text-xs font-extrabold text-[#0B3A66] tracking-widest uppercase leading-none">
                  MARINE POLLUTION
                </p>
                <p className="text-[10px] text-[#5E7183] mt-0.5 font-medium">Response System</p>
              </div>
            )}
          </div>

          {/* Close button on mobile */}
          <button
            onClick={onCloseMobile}
            className="p-1 rounded-lg text-[#5E7183] hover:text-[#17324D] hover:bg-[#F0F7FC] md:hidden transition"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 px-2.5 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, path, Icon, badge }) => {
            const isActive =
              path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(path);

            return (
              <NavLink
                key={id}
                to={path}
                id={`nav-${id}`}
                onClick={() => onCloseMobile?.()}
                className={`nav-item relative ${isActive ? "active" : ""}`}
                title={collapsed && !mobileOpen ? label : undefined}
                aria-label={label}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-[#1268B3]" : "text-[#5E7183]"}`} />
                {(!collapsed || mobileOpen) && (
                  <span className="flex-1">{label}</span>
                )}
                {(!collapsed || mobileOpen) && badge && (
                  <span className="badge badge-warning text-[9px] px-1.5 py-0.5">
                    {badge}
                  </span>
                )}
                {collapsed && !mobileOpen && badge && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#A86A00]" />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* System Module Status */}
        {(!collapsed || mobileOpen) && (
          <div className="px-3.5 py-3 mx-2.5 mb-3 rounded-xl bg-[#F3FAFE] border border-[#D9E8F2] shadow-sm animate-fade-in">
            <p className="text-[10px] text-[#5E7183] uppercase tracking-wider font-bold mb-1.5">
              System Pipeline
            </p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#087F68] live-dot-pulse shrink-0" />
              <span className="text-xs text-[#17324D] font-bold">Autonomous Tier-1 Active</span>
            </div>
            <div className="text-[10px] text-[#5E7183] mt-0.5 font-medium">SIH Demo Simulation Mode</div>
          </div>
        )}

        {/* Desktop Collapse Toggle */}
        <button
          id="sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden md:flex items-center justify-center w-full py-3 border-t border-[#D9E8F2]
                     text-[#5E7183] hover:text-[#1268B3] hover:bg-[#F3FAFE] transition-all duration-200"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span className="ml-2 text-xs font-semibold">Collapse Navigation</span>}
        </button>
      </aside>
    </>
  );
}
