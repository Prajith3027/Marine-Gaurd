import { useState, useRef, useEffect } from "react";
import {
  Bell,
  Settings,
  Wifi,
  WifiOff,
  Loader2,
  Menu,
  X,
  Cpu,
  Database,
  Sliders,
  Bot,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { useHealth } from "../../hooks/useHealth";
import { useLocation, Link, useNavigate } from "react-router-dom";
import apiService from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import type { SmartAlertItem } from "../../types";

const ROUTE_TITLES: Record<string, string> = {
  "/":                    "Operational Dashboard",
  "/admin/dashboard":     "Maritime Command Operations Center",
  "/admin/reports":       "Citizen Reports Management & Triage",
  "/admin/ais":           "Real-Time AIS Maritime Surveillance",
  "/admin/investigation": "Vessel Responsibility & Attribution",
  "/admin/hindcasting":   "Lagrangian Reverse-Drift Hindcasting",
  "/admin/drift":         "Forward Dispersion & Impact Forecast",
  "/admin/alerts":        "Coastal Emergency Public Broadcasts",
  "/admin/evidence":      "Compiled Evidentiary Dossier",
  "/admin/users":         "User Directory & RBAC Governance",
  "/admin/settings":      "System Diagnostics & AI Pipeline",
  "/admin/voice":         "Multilingual Voice Assistant",
  "/admin/waste":         "Marine Waste & Debris Command Desk",
  "/detect-waste":        "AI Marine Waste & Debris Detection",
  "/incidents":           "Incident Operations & Dossier",
  "/detect":              "AI Spill Detection",
  "/detect-spill":        "AI Spill Detection",
  "/priority":            "Priority Dispatch Queue",
  "/map":                 "Geospatial Intelligence Map",
  "/risk":                "Risk Studio & Explainability",
  "/resources":           "Resource Allocation Hub",
  "/reports":             "Citizen Reports Intelligence",
  "/simulator":           "What-If Oil Spill Simulator",
  "/alerts":              "Smart Alert & Restriction Command Center",
  "/assistant":           "Oil Spill AI Assistant",
};

interface HeaderProps {
  onToggleMobileNav?: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: "info" | "success" | "warning";
  read: boolean;
}

export function Header({ onToggleMobileNav }: HeaderProps) {
  const healthStatus = useHealth();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const pageTitle = ROUTE_TITLES[location.pathname] ?? "Marine Pollution Response System";

  // State for modals & popovers
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfile(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Live Smart Alerts state
  const [liveAlerts, setLiveAlerts] = useState<SmartAlertItem[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchLiveAlerts = async () => {
      try {
        const res = await apiService.getAlerts({ status: "ACTIVE", limit: 6 });
        if (isMounted && res.alerts) {
          setLiveAlerts(res.alerts);
        }
      } catch (err) {
        // Silently ignore if offline
      }
    };
    fetchLiveAlerts();
    const interval = setInterval(fetchLiveAlerts, 25000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleInlineAcknowledge = async (alertId: string) => {
    try {
      await apiService.acknowledgeAlert(alertId, { operator_name: "Duty Officer (Header Quick-Ack)" });
      setLiveAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (e) {
      console.error("Failed to acknowledge alert", e);
    }
  };

  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: "n1",
      title: "Tier-1 Autonomous Pipeline Active",
      message: "AI Detection, GIS Spatial Analysis, and Priority Dispatch Queue fully synchronized.",
      time: "Just now",
      type: "success",
      read: false,
    },
    {
      id: "n2",
      title: "DeepLabV3+ SAR Model Loaded",
      message: "Sentinel-1 & drone raster inference ready with PostGIS polygon generation.",
      time: "5m ago",
      type: "info",
      read: false,
    },
    {
      id: "n3",
      title: "PostGIS Spatial Engine Connected",
      message: "Indexed marine reserves, fishing zones, ports, and shipping corridors.",
      time: "12m ago",
      type: "info",
      read: true,
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length + liveAlerts.length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const statusConfig = {
    loading:   { Icon: Loader2,  color: "text-[#5E7183]", label: "Connecting...", spin: true },
    healthy:   { Icon: Wifi,     color: "text-[#087F68]", label: "API Online",  spin: false },
    unhealthy: { Icon: WifiOff,  color: "text-[#C6283D]",  label: "API Offline", spin: false },
  } as const;

  const { Icon, color, label, spin } = statusConfig[healthStatus];

  const { theme, toggleTheme } = useTheme();

  return (
    <>
      <header
        className="sticky top-0 z-30 flex items-center justify-between
                   px-4 sm:px-6 py-3.5 border-b border-[#D9E8F2]
                   bg-white/95 backdrop-blur-xl shadow-sm"
        role="banner"
      >
        {/* Left: Mobile hamburger + Page title */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger menu button */}
          <button
            onClick={onToggleMobileNav}
            className="p-2 -ml-1 rounded-lg text-[#5E7183] hover:text-[#17324D] hover:bg-[#F0F7FC] md:hidden transition"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-[#17324D] tracking-tight flex items-center gap-2">
              <span>{pageTitle}</span>
            </h1>
            <p className="text-[11px] text-[#5E7183] hidden sm:block font-medium">
              Autonomous Maritime Oil Spill &amp; Marine Waste Intelligence
            </p>
          </div>
        </div>

        {/* Right: API health + AI Copilot + Theme Toggle + Notifs + Settings + Profile */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Live System Health Pill */}
          <div
            id="health-indicator"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono transition-all ${
              healthStatus === "healthy"
                ? "border-[#9ADBC8] bg-[#EAF8F4] text-[#087F68]"
                : healthStatus === "unhealthy"
                ? "border-[#F5B5BC] bg-[#FFF1F2] text-[#C6283D]"
                : "border-[#D9E8F2] bg-[#F3FAFE] text-[#5E7183]"
            }`}
            title={`Backend Status: ${label}`}
            aria-label={`API status: ${label}`}
          >
            <Icon className={`w-3.5 h-3.5 ${spin ? "animate-spin" : ""} ${color}`} />
            <span className="text-[11px] font-bold hidden md:inline">{label}</span>
          </div>

          {/* AI Assistant Copilot quick button */}
          <Link
            to="/assistant"
            className="w-8 h-8 rounded-lg flex items-center justify-center
                       text-[#1268B3] hover:bg-[#EAF6FF]
                       transition-all duration-200 cursor-pointer border border-[#D9E8F2]"
            title="Open Oil Spill AI Copilot"
            aria-label="Open Oil Spill AI Copilot"
          >
            <Bot className="w-4 h-4 text-[#1268B3]" />
          </Link>

          {/* Theme Switcher Toggle (Light ☀ / Dark 🌙) */}
          <button
            id="theme-switcher-btn"
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg flex items-center justify-center
                       text-[#5E7183] hover:text-[#1268B3] hover:bg-[#F0F7FC]
                       transition-all duration-200 cursor-pointer border border-[#D9E8F2]"
            title={theme === "dark" ? "Switch to Light Theme (☀)" : "Switch to Dark Theme (🌙)"}
            aria-label={theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-[#FFD073]" />
            ) : (
              <Moon className="w-4 h-4 text-[#1268B3]" />
            )}
          </button>

          {/* Notifications button & popover */}
          <div className="relative" ref={notifRef}>
            <button
              id="notifications-btn"
              onClick={() => setShowNotifications((prev) => !prev)}
              className="relative w-8 h-8 rounded-lg flex items-center justify-center
                         text-[#5E7183] hover:text-[#1268B3] hover:bg-[#F0F7FC] border border-[#D9E8F2]
                         transition-all duration-200 cursor-pointer"
              aria-label={`Notifications (${unreadCount} unread)`}
              aria-expanded={showNotifications}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#C6283D] live-dot-pulse"
                  aria-hidden="true"
                />
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-[#D9E8F2] shadow-xl p-4 z-50 animate-fade-in space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#D9E8F2]">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#1268B3]" />
                    <span className="text-xs font-bold text-[#17324D] uppercase tracking-wider">
                      System Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="badge badge-warning text-[9px] px-1.5 py-0.2">
                        {unreadCount} New
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-[10px] text-[#1268B3] hover:text-[#0F4C81] font-bold transition"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {/* Live Smart Alerts Section */}
                  {liveAlerts.length > 0 && (
                    <div className="space-y-1.5 pb-2 border-b border-[#D9E8F2]">
                      <div className="text-[10px] font-bold text-[#C6283D] uppercase tracking-wider flex items-center justify-between">
                        <span>Active Spill Alerts ({liveAlerts.length})</span>
                        <span className="font-mono text-[9px] text-[#5E7183]">M23 System</span>
                      </div>
                      {liveAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={`p-2 rounded-xl border text-xs ${
                            alert.severity === "CRITICAL"
                              ? "bg-[#FFF1F2] border-[#F5B5BC] text-[#17324D]"
                              : "bg-[#FFF8E8] border-[#F3D58A] text-[#17324D]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-bold text-xs flex items-center gap-1 text-[#17324D]">
                              <span className="w-2 h-2 rounded-full bg-[#C6283D] animate-pulse" />
                              {alert.title}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-white border border-[#D9E8F2] text-[#17324D]">
                              {alert.severity}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#5E7183] leading-snug">{alert.message}</p>
                          {alert.recommended_restriction && (
                            <p className="text-[10px] text-[#A86A00] mt-1 font-mono font-semibold">
                              &bull; Advisory: {alert.recommended_restriction}
                            </p>
                          )}
                          <div className="mt-1.5 flex items-center justify-between pt-1 border-t border-[#D9E8F2] text-[10px]">
                            <span className="text-[#5E7183] font-mono">
                              ETA: {alert.eta_hours !== null && alert.eta_hours !== undefined ? `${alert.eta_hours.toFixed(1)}h` : "Immediate"}
                            </span>
                            <button
                              onClick={() => handleInlineAcknowledge(alert.id)}
                              className="px-2 py-0.5 rounded bg-[#1268B3] hover:bg-[#0F4C81] text-white font-semibold transition text-[10px]"
                            >
                              Quick Ack
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* System Event Logs */}
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-2 rounded-xl border text-xs transition ${
                        notif.read
                          ? "bg-[#F3FAFE] border-[#D9E8F2] text-[#5E7183]"
                          : "bg-white border-[#D9E8F2] text-[#17324D] shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-[#17324D] flex items-center gap-1.5">
                          {!notif.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#1268B3] shrink-0" />
                          )}
                          {notif.title}
                        </span>
                        <span className="text-[9px] text-[#5E7183] font-mono">{notif.time}</span>
                      </div>
                      <p className="text-[11px] text-[#5E7183] leading-relaxed">
                        {notif.message}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-[#D9E8F2] flex items-center justify-between text-[10px]">
                  <Link
                    to="/alerts"
                    onClick={() => setShowNotifications(false)}
                    className="text-[#1268B3] hover:text-[#0F4C81] font-bold flex items-center gap-1 transition"
                  >
                    <span>Open Alerts Command Center &rarr;</span>
                  </Link>
                  <span className="text-[#087F68] font-mono font-bold">Active Channel</span>
                </div>
              </div>
            )}
          </div>

          {/* System Settings & Diagnostics button */}
          <button
            id="settings-btn"
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center
                       text-[#5E7183] hover:text-[#1268B3] hover:bg-[#F0F7FC] border border-[#D9E8F2]
                       transition-all duration-200 cursor-pointer"
            aria-label="Open system settings and diagnostics"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* User avatar & popover */}
          <div className="relative" ref={profileRef}>
            <button
              id="user-avatar"
              onClick={() => setShowProfile((prev) => !prev)}
              className="w-8 h-8 rounded-full bg-[#0B3A66] flex items-center justify-center
                         text-xs font-bold text-white shadow-sm cursor-pointer border border-[#D9E8F2]"
              aria-label="User profile"
              aria-expanded={showProfile}
            >
              {user?.name ? user.name.slice(0, 2).toUpperCase() : "AD"}
            </button>

            {/* Profile popover */}
            {showProfile && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-xl p-4 z-50 animate-fade-in space-y-3 text-xs">
                <div className="flex items-center gap-3 pb-3 border-b border-[#D9E8F2] dark:border-[#1a3854]">
                  <div className="w-9 h-9 rounded-full bg-[#0B3A66] flex items-center justify-center font-bold text-white shrink-0">
                    {user?.name ? user.name.slice(0, 2).toUpperCase() : "AD"}
                  </div>
                  <div className="truncate">
                    <div className="font-bold text-[#17324D] dark:text-white truncate">
                      {user?.name || "Emergency Officer"}
                    </div>
                    <div className="text-[10px] text-[#5E7183] dark:text-slate-400 truncate">
                      {user?.email || "admin@maritime.gov.in"}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-[11px] text-[#17324D] dark:text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-[#5E7183] dark:text-slate-400">Sector:</span>
                    <span className="font-mono font-semibold">MRCC Bay of Bengal</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5E7183] dark:text-slate-400">Authorization:</span>
                    <span className="badge badge-success text-[9px] uppercase">
                      {user?.role || "ADMIN"} TIER-1
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5E7183] dark:text-slate-400">Operation:</span>
                    <span className="text-[#1268B3] dark:text-[#00f3ff] font-bold">SIH 2026</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#D9E8F2] dark:border-[#1a3854] space-y-1.5">
                  <button
                    onClick={() => {
                      logout();
                      navigate("/login");
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out (Logout)</span>
                  </button>
                  <button
                    onClick={() => setShowProfile(false)}
                    className="w-full text-center text-[10px] text-[#5E7183] hover:text-[#17324D] font-semibold transition py-1"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* System Settings & Diagnostics Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-[#17324D]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-[#D9E8F2] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9E8F2]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#EAF6FF] border border-[#A9D9F5] flex items-center justify-center text-[#1268B3]">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#17324D]">System Diagnostics &amp; Engine Config</h3>
                  <p className="text-[10px] text-[#5E7183]">AI Oil Spill Intelligence System • v0.1.0</p>
                </div>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg text-[#5E7183] hover:text-[#17324D] hover:bg-[#F0F7FC] transition"
                aria-label="Close settings modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Diagnostics Cards */}
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#F3FAFE] border border-[#D9E8F2] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#17324D] flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-[#1268B3]" />
                    AI Detection Engine
                  </span>
                  <span className="badge badge-success text-[10px]">DeepLabV3+ Active</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#5E7183] pt-1">
                  <div>Model: <span className="font-mono text-[#17324D] font-semibold">SAR UNet / ResNet50</span></div>
                  <div>Inference: <span className="font-mono text-[#087F68] font-bold">~120 ms</span></div>
                  <div>Confidence Gate: <span className="font-mono text-[#A86A00] font-bold">&gt; 70%</span></div>
                  <div>Output: <span className="font-mono text-[#17324D] font-semibold">GeoJSON Polygon</span></div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F3FAFE] border border-[#D9E8F2] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#17324D] flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-[#1268B3]" />
                    Spatial Database &amp; GIS
                  </span>
                  <span className="badge badge-success text-[10px]">PostGIS Connected</span>
                </div>
                <div className="text-[11px] text-[#5E7183] space-y-1">
                  <div>Host: <span className="font-mono text-[#17324D] font-semibold">localhost:5432 / oilspill_db</span></div>
                  <div>Proximity Buffer: <span className="font-mono text-[#17324D] font-semibold">50 km maritime search radius</span></div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F3FAFE] border border-[#D9E8F2] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#17324D] flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[#A86A00]" />
                    Transparent Risk Model Weights
                  </span>
                  <span className="text-[10px] font-mono text-[#5E7183]">Normalized 0-100</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div className="p-2 rounded-lg bg-white border border-[#D9E8F2]">
                    <div className="text-[#5E7183]">Coast Proximity</div>
                    <div className="font-bold text-[#0B3A66] font-mono mt-0.5 text-xs">30%</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-[#D9E8F2]">
                    <div className="text-[#5E7183]">Spill Volume</div>
                    <div className="font-bold text-[#0B3A66] font-mono mt-0.5 text-xs">25%</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-[#D9E8F2]">
                    <div className="text-[#5E7183]">Protected Areas</div>
                    <div className="font-bold text-[#0B3A66] font-mono mt-0.5 text-xs">20%</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#D9E8F2] flex items-center justify-between text-xs">
              <span className="text-[11px] text-[#5E7183]">Smart India Hackathon 2024</span>
              <button
                onClick={() => setShowSettings(false)}
                className="btn-primary text-xs py-1.5 px-4"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
