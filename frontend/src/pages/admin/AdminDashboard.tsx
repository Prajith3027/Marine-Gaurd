import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShieldAlert,
  AlertTriangle,
  ScanSearch,
  Waves,
  Compass,
  Filter,
  Eye,
  X,
  Anchor,
} from "lucide-react";
import { adminApi, type IncidentBrief } from "../../services/adminApi";
import { wasteApi, type MarineWasteIncident, type MarineWasteSummary } from "../../services/wasteApi";
import type { AdminDashboardSummary } from "../../types/auth";
import { MarineLoader } from "../../components/ui/MarineLoader";

export default function AdminDashboard() {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [wasteSummary, setWasteSummary] = useState<MarineWasteSummary | null>(null);
  const [incidents, setIncidents] = useState<IncidentBrief[]>([]);
  const [wasteIncidents, setWasteIncidents] = useState<MarineWasteIncident[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (Phase 6.2)
  const [pollutionTypeFilter, setPollutionTypeFilter] = useState<"ALL" | "OIL_SPILL" | "MARINE_WASTE">("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [wasteTypeFilter, setWasteTypeFilter] = useState<string>("ALL");

  // Selected Marine Waste Incident Modal (Phase 6.4)
  const [selectedIncident, setSelectedIncident] = useState<MarineWasteIncident | null>(null);
  const [actionInput, setActionInput] = useState<string>("BEACH_CLEANUP_CREW");
  const [actionNotes, setActionNotes] = useState<string>("");
  const [statusInput, setStatusInput] = useState<string>("ACTION_ASSIGNED");
  const [submittingAction, setSubmittingAction] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sumRes, incRes, wasteSumRes, wasteIncRes] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.getIncidents(),
        wasteApi.getSummary().catch(() => null),
        wasteApi.getIncidents().catch(() => []),
      ]);
      setSummary(sumRes);
      setIncidents(incRes.slice(0, 8));
      setWasteSummary(wasteSumRes);
      setWasteIncidents(wasteIncRes);
    } catch (err) {
      console.error("Failed to load admin dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenIncident = (inc: MarineWasteIncident) => {
    setSelectedIncident(inc);
    setActionInput(inc.action_taken !== "NONE" ? inc.action_taken : (inc.recommended_action || "BEACH_CLEANUP_CREW"));
    setActionNotes(inc.action_notes || "");
    setStatusInput(inc.status || "ACTION_ASSIGNED");
  };

  const handleDispatchAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident) return;
    try {
      setSubmittingAction(true);
      const updated = await wasteApi.dispatchAction(selectedIncident.id, {
        action: actionInput,
        action_notes: actionNotes,
        status_update: statusInput,
      });
      setSelectedIncident(updated);
      await loadData();
    } catch (err) {
      console.error("Failed to dispatch action", err);
    } finally {
      setSubmittingAction(false);
    }
  };

  // Filtered Marine Waste incidents
  const filteredWasteIncidents = wasteIncidents.filter((inc) => {
    if (severityFilter !== "ALL" && inc.severity !== severityFilter) return false;
    if (statusFilter !== "ALL" && inc.status !== statusFilter) return false;
    if (wasteTypeFilter !== "ALL" && inc.waste_type !== wasteTypeFilter) return false;
    return true;
  });

  // Filtered Oil Spill incidents
  const filteredOilSpills = incidents.filter((inc) => {
    if (severityFilter !== "ALL" && inc.severity !== severityFilter) return false;
    if (statusFilter !== "ALL" && inc.status !== statusFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <MarineLoader text="Connecting to Maritime Operations Command Center..." />
      </div>
    );
  }

  // Unified Overview Metrics (Phase 6.1)
  const totalPollutionCount =
    summary?.total_pollution_incidents ??
    ((summary?.active_oil_spills ?? 0) + (wasteSummary?.total_incidents ?? wasteIncidents.length));
  const oilSpillCount = summary?.oil_spill_incidents ?? (summary?.active_oil_spills ?? 0);
  const marineWasteCount = summary?.marine_waste_incidents ?? (wasteSummary?.total_incidents ?? wasteIncidents.length);
  const criticalCount =
    summary?.critical_incidents ??
    ((summary?.high_risk_incidents ?? 0) + (wasteSummary?.critical_severity_count ?? 0));
  const highPriorityCount =
    summary?.high_priority_incidents ??
    ((summary?.high_risk_incidents ?? 0) + (wasteSummary?.immediate_priority_count ?? 0));
  const pendingActionsCount =
    summary?.pending_actions ??
    ((wasteSummary?.active_hotspots ?? 0) + (summary?.reports_under_investigation ?? 0));
  const resolvedCount =
    summary?.resolved_pollution_incidents ??
    ((summary?.resolved_incidents ?? 0) + (wasteSummary?.resolved_count ?? 0));

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in pb-12">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#00172e] via-[#002f5c] to-[#005599] text-white border border-[#00f3ff]/30 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="badge badge-critical text-[10px] font-mono">
              COMMAND ACTIVE
            </span>
            <span className="text-[10px] font-mono text-[#00f3ff]">
              MARINE POLLUTION RESPONSE SYSTEM • ADMIN DESK
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Maritime Emergency Response Command Center
          </h1>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Multi-hazard marine pollution operational console: Automated hydrocarbon satellite segmentation,
            Lagrangian reverse-drift hindcasting, AIS vessel tracking, and Vision AI Marine Waste & Debris intelligence.
          </p>
        </div>

        {/* Quick Launch Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link
            to="/admin/detection"
            className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-[#00f3ff] text-[#00172e] font-black text-xs uppercase tracking-wider shadow hover:bg-[#48f7ff] transition"
          >
            <ScanSearch className="w-4 h-4" />
            <span>Oil SAR Detect</span>
          </Link>
          <Link
            to="/waste/detect"
            className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#00172e] font-black text-xs uppercase tracking-wider shadow transition"
          >
            <Waves className="w-4 h-4" />
            <span>AI Waste Detect</span>
          </Link>
          <Link
            to="/map"
            className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider shadow transition border border-slate-700"
          >
            <Compass className="w-4 h-4" />
            <span>GIS Map</span>
          </Link>
        </div>
      </div>

      {/* PHASE 6.1 — ADMIN POLLUTION OVERVIEW (7 REQUIRED METRICS) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Pollution Operations Overview
          </span>
          <span className="text-[11px] text-slate-400 font-mono">Real-time Cross-Module Aggregation</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {/* 1. Total Pollution Incidents */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
            <span className="text-[10px] font-semibold text-slate-500 block truncate">Total Incidents</span>
            <p className="text-xl font-black text-[#17324D] dark:text-white mt-1">
              {totalPollutionCount}
            </p>
            <span className="text-[9px] text-[#0066b2] dark:text-[#00f3ff] font-bold">Dual Module</span>
          </div>

          {/* 2. Oil Spill Incidents */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
            <span className="text-[10px] font-semibold text-slate-500 block truncate">🛢️ Oil Spills</span>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {oilSpillCount}
            </p>
            <span className="text-[9px] text-amber-500 font-bold">Active Slicks</span>
          </div>

          {/* 3. Marine Waste Incidents */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
            <span className="text-[10px] font-semibold text-slate-500 block truncate">🌊 Marine Waste</span>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {marineWasteCount}
            </p>
            <span className="text-[9px] text-emerald-500 font-bold">Hotspots Logged</span>
          </div>

          {/* 4. Critical Incidents */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
            <span className="text-[10px] font-semibold text-slate-500 block truncate">Critical Incidents</span>
            <p className="text-xl font-black text-red-600 dark:text-red-400 mt-1">
              {criticalCount}
            </p>
            <span className="text-[9px] text-red-500 font-bold">Score &ge; 76</span>
          </div>

          {/* 5. High Priority Incidents */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
            <span className="text-[10px] font-semibold text-slate-500 block truncate">High Priority</span>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
              {highPriorityCount}
            </p>
            <span className="text-[9px] text-rose-500 font-bold">P1 / Urgent</span>
          </div>

          {/* 6. Pending Actions */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
            <span className="text-[10px] font-semibold text-slate-500 block truncate">Pending Actions</span>
            <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {pendingActionsCount}
            </p>
            <span className="text-[9px] text-indigo-500 font-bold">Triage Queue</span>
          </div>

          {/* 7. Resolved Incidents */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
            <span className="text-[10px] font-semibold text-slate-500 block truncate">Resolved</span>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {resolvedCount}
            </p>
            <span className="text-[9px] text-emerald-500 font-bold">Cleaned / Closed</span>
          </div>
        </div>
      </div>

      {/* PHASE 6.2 — POLLUTION TYPE FILTER & CONTROLS */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Module Segmented Buttons */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#122e47] border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setPollutionTypeFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              pollutionTypeFilter === "ALL"
                ? "bg-[#1268B3] text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-white"
            }`}
          >
            All Pollution Types
          </button>
          <button
            type="button"
            onClick={() => setPollutionTypeFilter("OIL_SPILL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              pollutionTypeFilter === "OIL_SPILL"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
            }`}
          >
            <span>🛢️ Oil Spill</span>
          </button>
          <button
            type="button"
            onClick={() => setPollutionTypeFilter("MARINE_WASTE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              pollutionTypeFilter === "MARINE_WASTE"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
            }`}
          >
            <span>🌊 Marine Waste &amp; Debris</span>
          </button>
        </div>

        {/* Secondary Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-bold">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#122e47] text-xs font-semibold"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MODERATE">Moderate</option>
            <option value="LOW">Low</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#122e47] text-xs font-semibold"
          >
            <option value="ALL">All Statuses</option>
            <option value="REPORTED">Reported</option>
            <option value="ACTION_ASSIGNED">Action Assigned</option>
            <option value="CLEANUP_DISPATCHED">Dispatched</option>
            <option value="RESOLVED">Resolved</option>
          </select>

          {/* Waste Type Filter (when Marine Waste is active) */}
          {(pollutionTypeFilter === "ALL" || pollutionTypeFilter === "MARINE_WASTE") && (
            <select
              value={wasteTypeFilter}
              onChange={(e) => setWasteTypeFilter(e.target.value)}
              className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#122e47] text-xs font-semibold"
            >
              <option value="ALL">All Categories</option>
              <option value="FLOATING_PLASTIC">Floating Plastic</option>
              <option value="PLASTIC_BOTTLES">Plastic Bottles</option>
              <option value="FISHING_NETS">Fishing Nets</option>
              <option value="MARINE_DEBRIS">Marine Debris</option>
              <option value="FLOATING_WASTE">Floating Waste</option>
              <option value="OTHER_WASTE">Other Waste</option>
            </select>
          )}
        </div>
      </div>

      {/* PHASE 6.3 — MARINE WASTE INCIDENT TABLE */}
      {(pollutionTypeFilter === "ALL" || pollutionTypeFilter === "MARINE_WASTE") && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                <Waves className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#17324D] dark:text-white flex items-center gap-2">
                  <span>Marine Waste &amp; Debris Operational Queue</span>
                  <span className="badge bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]">
                    {filteredWasteIncidents.length} Records
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Vision AI detected debris sites, ghost net hazards, plastic clusters, and assigned response crews.
                </p>
              </div>
            </div>
            <Link
              to="/admin/marine-waste"
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-bold flex items-center gap-1"
            >
              <span>Dedicated Marine Waste Desk &rarr;</span>
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[11px] text-slate-400 uppercase border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Incident ID</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Waste Type</th>
                  <th className="py-2.5 px-3">Density</th>
                  <th className="py-2.5 px-3">Est. Quantity</th>
                  <th className="py-2.5 px-3">Pollution Score</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredWasteIncidents.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-400 text-xs">
                      No marine waste incidents found matching active filters.
                    </td>
                  </tr>
                ) : (
                  filteredWasteIncidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {inc.incident_code}
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(inc.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 text-[#17324D] dark:text-slate-200 max-w-[140px] truncate">
                        {inc.location_name || "Coastal Sector"}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">
                        {inc.waste_type.replace(/_/g, " ")}
                      </td>
                      <td className="py-3 px-3">
                        <span className="badge badge-info text-[9px]">{inc.density}</span>
                      </td>
                      <td className="py-3 px-3 font-mono">
                        {inc.estimated_items_count} items
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {inc.pollution_score} / 100
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`badge text-[9px] font-bold ${
                            inc.severity === "CRITICAL"
                              ? "badge-danger"
                              : inc.severity === "HIGH"
                              ? "badge-warning"
                              : "badge-info"
                          }`}
                        >
                          {inc.severity}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white ${
                            inc.cleanup_priority.includes("P1")
                              ? "bg-red-600"
                              : inc.cleanup_priority.includes("P2")
                              ? "bg-amber-600"
                              : "bg-blue-600"
                          }`}
                        >
                          {inc.cleanup_priority.slice(0, 2)}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="badge badge-active text-[9px]">{inc.status}</span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenIncident(inc)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shadow-sm transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OIL SPILL INCIDENTS QUEUE (PRESERVED 100%) */}
      {(pollutionTypeFilter === "ALL" || pollutionTypeFilter === "OIL_SPILL") && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#17324D] dark:text-white flex items-center gap-2">
                  <span>Oil Spill Incident Command Queue</span>
                  <span className="badge bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]">
                    {filteredOilSpills.length} Records
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Select an incident to view its AIS correlation, satellite segmentation, or hindcast origin.
                </p>
              </div>
            </div>
            <Link
              to="/incidents"
              className="text-xs text-[#0066b2] dark:text-[#00f3ff] hover:underline font-bold flex items-center gap-1"
            >
              <span>Open Incident Operations &rarr;</span>
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[11px] text-slate-400 uppercase border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Incident Code</th>
                  <th className="py-2.5 px-3">Location (Lat, Lon)</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Spill Area</th>
                  <th className="py-2.5 px-3">Risk Score</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOilSpills.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                      No oil spill incidents found matching active filters.
                    </td>
                  </tr>
                ) : (
                  filteredOilSpills.map((inc) => (
                    <tr key={inc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-[#0066b2] dark:text-[#00f3ff]">
                        {inc.incident_code}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        {inc.latitude.toFixed(3)}°N, {inc.longitude.toFixed(3)}°E
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`badge text-[9px] ${
                            inc.severity === "CRITICAL"
                              ? "badge-danger"
                              : inc.severity === "HIGH"
                              ? "badge-warning"
                              : "badge-info"
                          }`}
                        >
                          {inc.severity}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono">
                        {inc.spill_area_km2 ? `${inc.spill_area_km2.toFixed(1)} km²` : "N/A"}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold">
                        {inc.risk_score ? inc.risk_score.toFixed(1) : "N/A"}
                      </td>
                      <td className="py-3 px-3">
                        <span className="badge badge-active text-[9px]">{inc.status}</span>
                      </td>
                      <td className="py-3 px-3 text-right space-x-1.5">
                        <Link
                          to={`/admin/hindcasting?incident=${inc.incident_code}`}
                          className="inline-block px-2 py-1 rounded bg-[#EAF6FF] dark:bg-[#12385c] text-[#0066b2] dark:text-[#00f3ff] hover:bg-[#0066b2] hover:text-white transition text-[10px] font-semibold"
                        >
                          Hindcast
                        </Link>
                        <Link
                          to={`/admin/investigation?incident=${inc.incident_code}`}
                          className="inline-block px-2 py-1 rounded bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white transition text-[10px] font-semibold"
                        >
                          Vessels
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PHASE 6.4 — INCIDENT DETAILS MODAL (5 REQUIRED SECTIONS) */}
      {selectedIncident && (
        <div className="fixed inset-0 z-[1500] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-8 animate-fade-in max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#122e47]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                    {selectedIncident.incident_code}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase text-white ${
                    selectedIncident.severity === "CRITICAL" ? "bg-red-600" :
                    selectedIncident.severity === "HIGH" ? "bg-amber-600" : "bg-emerald-600"
                  }`}>
                    {selectedIncident.severity}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-white text-[10px] font-mono font-bold">
                    {selectedIncident.cleanup_priority}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#17324D] dark:text-white mt-0.5">
                  Marine Waste Operational Dossier
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIncident(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* SECTION 1: DETECTION */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  1. Detection Intelligence
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Waste Type</span>
                    <span className="font-bold text-[#17324D] dark:text-white truncate block">
                      {selectedIncident.waste_type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Confidence</span>
                    <span className="font-bold font-mono text-[#17324D] dark:text-white block">
                      {((selectedIncident.confidence || 0.88) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Est. Quantity</span>
                    <span className="font-bold text-[#17324D] dark:text-white block">
                      {selectedIncident.estimated_items_count} items
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Waste Density</span>
                    <span className="font-bold text-[#17324D] dark:text-white block">
                      {selectedIncident.density}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Affected Area</span>
                    <span className="font-bold text-[#17324D] dark:text-white block">
                      {selectedIncident.estimated_area_m2} m²
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 2: LOCATION */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  2. Geospatial Location Context
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">GPS Coordinates</span>
                    <span className="font-bold font-mono text-[#17324D] dark:text-white block">
                      {selectedIncident.latitude.toFixed(4)}°N, {selectedIncident.longitude.toFixed(4)}°E
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Location Name</span>
                    <span className="font-bold text-[#17324D] dark:text-white block truncate">
                      {selectedIncident.location_name || "Coastal Marine Sector"}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Coast Distance</span>
                    <span className="font-bold text-[#17324D] dark:text-white block">
                      {selectedIncident.distance_from_coast_km ?? 2.5} km
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Ecol. Sensitivity</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 block">
                      Protected Marine Zone
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 3: RISK & SCORING BREAKDOWN */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  3. Risk Scoring &amp; Mathematical Model
                </span>
                <div className="p-3.5 rounded-xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Formula Score:</span>
                      <span className="font-mono text-lg font-black text-emerald-600 dark:text-emerald-400">
                        {selectedIncident.pollution_score} <span className="text-xs text-slate-400 font-normal">/ 100</span>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Formula Weights Applied:</span>
                      <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300">
                        Density (35%) + Area (25%) + Coast (15%) + Eco (15%) + Severity (10%)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-1 text-[11px]">
                    {selectedIncident.entanglement_hazard && (
                      <span className="text-red-600 dark:text-red-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Entanglement Hazard (Ghost Net)
                      </span>
                    )}
                    {selectedIncident.navigation_hazard && (
                      <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                        <Anchor className="w-3.5 h-3.5" /> Navigation Channel Risk
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 4: EVIDENCE MEDIA */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  4. Evidence &amp; AI Mask Overlays
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedIncident.image_url ? (
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 h-40 flex items-center justify-center">
                      <img
                        src={selectedIncident.image_url}
                        alt="Evidence Capture"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 h-40 flex flex-col items-center justify-center text-slate-400 text-xs">
                      <Waves className="w-6 h-6 mb-1 opacity-50" />
                      <span>Original Sighting Evidence</span>
                    </div>
                  )}

                  {selectedIncident.mask_overlay_url ? (
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 h-40 flex items-center justify-center">
                      <img
                        src={selectedIncident.mask_overlay_url}
                        alt="Segmentation Mask Overlay"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 h-40 flex flex-col items-center justify-center text-slate-400 text-xs">
                      <ScanSearch className="w-6 h-6 mb-1 opacity-50" />
                      <span>AI Semantic Segmentation Overlay</span>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 5: RESPONSE & AUTHORITY ACTION ASSIGNMENT */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  5. Authority Response &amp; Status Dispatch
                </span>
                <form onSubmit={handleDispatchAction} className="p-4 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold mb-1">
                        Recommended Action:
                      </label>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 block py-1">
                        {selectedIncident.recommended_action || "Beach Cleanup Crew"}
                      </span>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold mb-1">
                        Assign Action:
                      </label>
                      <select
                        value={actionInput}
                        onChange={(e) => setActionInput(e.target.value)}
                        className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0c1f33] text-xs font-semibold"
                      >
                        <option value="BEACH_CLEANUP_CREW">Beach Cleanup Crew</option>
                        <option value="HARBOR_SKIMMER_BOAT">Harbor Skimmer Boat</option>
                        <option value="DIVING_RETRIEVAL_NET">Diving Retrieval Net</option>
                        <option value="PORT_NOTIFICATION">Port Notification</option>
                        <option value="ENVIRONMENTAL_INSPECTION">Environmental Inspection</option>
                        <option value="MONITOR_AREA">Monitor Area</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold mb-1">
                        Update Status:
                      </label>
                      <select
                        value={statusInput}
                        onChange={(e) => setStatusInput(e.target.value)}
                        className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0c1f33] text-xs font-semibold"
                      >
                        <option value="PENDING">Pending</option>
                        <option value="UNDER_REVIEW">Under Review</option>
                        <option value="ACTION_ASSIGNED">Action Assigned</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="RESOLVED">Resolved</option>
                        <option value="REJECTED">Rejected</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold mb-1">
                      Action Notes / Crew Dispatch Instructions:
                    </label>
                    <textarea
                      rows={2}
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="Add operational dispatch instructions, crew vessel numbers, or resolution details..."
                      className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0c1f33] text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={submittingAction}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
                    >
                      {submittingAction ? "Updating Action..." : "Save Action & Update Status"}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#122e47] flex items-center justify-between text-xs text-slate-500">
              <span>Updated: {new Date(selectedIncident.updated_at).toLocaleString()}</span>
              <button
                type="button"
                onClick={() => setSelectedIncident(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
