import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Waves,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Anchor,
  Fish,
  Users,
  Search,
  Crosshair,
  X,
} from "lucide-react";
import {
  wasteApi,
  type MarineWasteIncident,
  type MarineWasteSummary,
} from "../../services/wasteApi";
import { MarineLoader } from "../../components/ui/MarineLoader";

export default function AdminMarineWastePage() {
  const [summary, setSummary] = useState<MarineWasteSummary | null>(null);
  const [incidents, setIncidents] = useState<MarineWasteIncident[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [wasteTypeFilter, setWasteTypeFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Action Dispatch Modal
  const [selectedIncident, setSelectedIncident] = useState<MarineWasteIncident | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedAction, setSelectedAction] = useState<
    "NONE" | "BEACH_CLEANUP_CREW" | "HARBOR_SKIMMER_BOAT" | "DIVING_RETRIEVAL_NET" | "PORT_NOTIFICATION"
  >("BEACH_CLEANUP_CREW");
  const [actionNotes, setActionNotes] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumRes, incRes] = await Promise.all([
        wasteApi.getSummary(),
        wasteApi.getIncidents({
          status: statusFilter,
          waste_type: wasteTypeFilter,
          severity: severityFilter,
        }),
      ]);
      setSummary(sumRes);
      setIncidents(incRes);
    } catch (err) {
      console.error("Failed to load marine waste data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, wasteTypeFilter, severityFilter]);

  const handleOpenActionModal = (inc: MarineWasteIncident) => {
    setSelectedIncident(inc);
    if (inc.waste_type === "FISHING_NETS") {
      setSelectedAction("DIVING_RETRIEVAL_NET");
    } else if (inc.waste_type === "MARINE_DEBRIS") {
      setSelectedAction("HARBOR_SKIMMER_BOAT");
    } else {
      setSelectedAction("BEACH_CLEANUP_CREW");
    }
    setActionNotes(inc.action_notes || "");
    setShowActionModal(true);
  };

  const handleDispatchAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident) return;
    setSubmittingAction(true);
    try {
      await wasteApi.dispatchAction(selectedIncident.id, {
        action: selectedAction,
        action_notes: actionNotes,
        status_update: "CLEANUP_DISPATCHED",
      });
      setShowActionModal(false);
      await loadData();
    } catch (err: any) {
      alert("Failed to dispatch action: " + (err?.detail || err?.message));
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleMarkResolved = async (id: string) => {
    try {
      await wasteApi.dispatchAction(id, {
        action: "NONE",
        action_notes: "Cleanup operation successfully concluded.",
        status_update: "RESOLVED",
      });
      await loadData();
    } catch (err: any) {
      alert("Failed to resolve incident: " + (err?.detail || err?.message));
    }
  };

  const filteredIncidents = incidents.filter((i) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      i.incident_code.toLowerCase().includes(q) ||
      i.waste_type.toLowerCase().includes(q) ||
      (i.location_name && i.location_name.toLowerCase().includes(q))
    );
  });

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "CRITICAL":
        return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30";
      case "HIGH":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
      case "MODERATE":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
      default:
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    }
  };

  const getPriorityBadge = (prio: string) => {
    if (prio.includes("P1")) return "bg-red-600 text-white";
    if (prio.includes("P2")) return "bg-amber-600 text-white";
    if (prio.includes("P3")) return "bg-blue-600 text-white";
    return "bg-slate-600 text-white";
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#00382b] via-[#00523f] to-[#047857] text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-emerald-400/30">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="badge bg-emerald-400/20 text-emerald-200 border-emerald-400/30 text-[10px] font-mono">
              OPERATIONAL COMMAND
            </span>
            <span className="text-emerald-200 text-xs font-mono">• MARINE WASTE &amp; DEBRIS DESK</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
            <Waves className="w-7 h-7 text-emerald-300" />
            <span>Marine Waste &amp; Debris Command Center</span>
          </h1>
          <p className="text-xs text-emerald-100 max-w-2xl leading-relaxed">
            Autonomous coastal waste hotspot triage, ghost fishing net hazard mitigation,
            drone vision telemetry verification, and rapid cleanup fleet dispatch.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/detect-waste"
            className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-black text-xs uppercase tracking-wider shadow transition"
          >
            <Crosshair className="w-4 h-4" />
            <span>AI Waste Detect</span>
          </Link>
          <Link
            to="/map"
            className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider border border-white/20 transition"
          >
            <span>GIS Map Layer</span>
          </Link>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="p-4 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Active Hotspots</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Waves className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-[#17324D] dark:text-white mt-1.5">
            {summary?.active_hotspots ?? 0}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Critical Severity</span>
            <div className="w-7 h-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-1.5">
            {summary?.critical_severity_count ?? 0}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Immediate P1</span>
            <div className="w-7 h-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-1.5">
            {summary?.immediate_priority_count ?? 0}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Ghost Net Hazards</span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Fish className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1.5">
            {summary?.entanglement_hazards_count ?? 0}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Crews Dispatched</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1.5">
            {summary?.dispatched_actions_count ?? 0}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Resolved Sites</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5">
            {summary?.resolved_count ?? 0}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by code, waste category, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-[#17324D] dark:text-white placeholder-slate-400 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={wasteTypeFilter}
            onChange={(e) => setWasteTypeFilter(e.target.value)}
            className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#122e47] text-xs font-semibold"
          >
            <option value="ALL">All Categories</option>
            <option value="FISHING_NETS">Fishing Nets</option>
            <option value="PLASTIC_BOTTLES">Plastic Bottles</option>
            <option value="FLOATING_PLASTIC">Floating Plastic</option>
            <option value="MARINE_DEBRIS">Marine Debris</option>
            <option value="FLOATING_WASTE">Floating Waste</option>
            <option value="OTHER_WASTE">Other Waste</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#122e47] text-xs font-semibold"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MODERATE">Moderate</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#122e47] text-xs font-semibold"
          >
            <option value="ALL">All Statuses</option>
            <option value="REPORTED">Reported</option>
            <option value="AI_VERIFIED">AI Verified</option>
            <option value="CLEANUP_DISPATCHED">Dispatched</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
      </div>

      {/* Incidents Data Table */}
      <div className="rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm overflow-hidden">
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <MarineLoader text="Loading Active Marine Debris Operations Queue..." />
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
            <Waves className="w-8 h-8 mb-2 opacity-50" />
            <p>No marine waste incidents found matching active filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#122e47] border-b border-slate-200 dark:border-slate-700 text-slate-400 text-[10px] uppercase font-mono">
                <tr>
                  <th className="py-3 px-4">Incident Code</th>
                  <th className="py-3 px-4">Waste Category</th>
                  <th className="py-3 px-4">Pollution Score</th>
                  <th className="py-3 px-4">Severity / Priority</th>
                  <th className="py-3 px-4">Location Sector</th>
                  <th className="py-3 px-4">Hazards</th>
                  <th className="py-3 px-4">Status &amp; Action</th>
                  <th className="py-3 px-4 text-right">Operations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredIncidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {inc.incident_code}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-[#17324D] dark:text-white">
                      {inc.waste_type.replace(/_/g, " ")}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-bold font-mono">
                        <span className="text-emerald-600 dark:text-emerald-400">{inc.pollution_score}</span>
                        <span className="text-[10px] text-slate-400">/ 100</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`py-0.5 px-2 rounded-full text-[10px] font-black border ${getSeverityBadge(inc.severity)}`}>
                          {inc.severity}
                        </span>
                        <span className={`py-0.5 px-2 rounded-full text-[9px] font-bold ${getPriorityBadge(inc.cleanup_priority)}`}>
                          {inc.cleanup_priority}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      <div className="truncate max-w-[180px]">{inc.location_name}</div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {inc.latitude.toFixed(4)}°N, {inc.longitude.toFixed(4)}°E
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1 text-[10px]">
                        {inc.entanglement_hazard && (
                          <span className="text-red-600 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Net Entanglement
                          </span>
                        )}
                        {inc.navigation_hazard && (
                          <span className="text-amber-600 font-bold flex items-center gap-1">
                            <Anchor className="w-3 h-3" /> Navigation Risk
                          </span>
                        )}
                        {!inc.entanglement_hazard && !inc.navigation_hazard && (
                          <span className="text-slate-400">Normal Debris</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <span className="py-0.5 px-2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px]">
                          {inc.status}
                        </span>
                        {inc.action_taken !== "NONE" && (
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                            Action: {inc.action_taken.replace(/_/g, " ")}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenActionModal(inc)}
                          className="py-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-sm transition"
                        >
                          Dispatch Action
                        </button>
                        {inc.status !== "RESOLVED" && (
                          <button
                            type="button"
                            onClick={() => handleMarkResolved(inc.id)}
                            className="py-1 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 text-slate-600 dark:text-slate-300 font-semibold text-[11px] transition"
                            title="Mark as Resolved"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Dispatch Modal */}
      {showActionModal && selectedIncident && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#122e47]">
              <div>
                <span className="text-[10px] font-mono text-emerald-600 font-bold">AUTHORITY DISPATCH</span>
                <h3 className="text-sm font-black text-[#17324D] dark:text-white">
                  Assign Cleanup Resource to {selectedIncident.incident_code}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowActionModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDispatchAction} className="p-5 space-y-4">
              <div className="space-y-1 text-xs">
                <span className="font-bold text-slate-500">Incident Classification:</span>
                <p className="font-black text-sm text-[#17324D] dark:text-white">
                  {selectedIncident.waste_type.replace(/_/g, " ")} • Score: {selectedIncident.pollution_score}/100 • Priority: {selectedIncident.cleanup_priority}
                </p>
                <p className="text-[11px] text-slate-400">{selectedIncident.location_name}</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Select Dedicated Response Fleet / Crew:
                </label>
                <select
                  value={selectedAction}
                  onChange={(e: any) => setSelectedAction(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#122e47] text-xs font-bold"
                >
                  <option value="BEACH_CLEANUP_CREW">Beach Cleanup Volunteer &amp; Municipal Crew</option>
                  <option value="HARBOR_SKIMMER_BOAT">Harbor Debris Skimmer Boat (Floating Trash Booms)</option>
                  <option value="DIVING_RETRIEVAL_NET">Marine Diver Retrieval Team (Ghost Net Extraction)</option>
                  <option value="PORT_NOTIFICATION">Port Traffic Authority Notification &amp; Exclusion Zone</option>
                  <option value="ENVIRONMENTAL_INSPECTION">Environmental Inspection &amp; Habitat Sampling</option>
                  <option value="MONITOR_AREA">Monitor Area (Passive Aerial / Drone Surveillance)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Operational Directive Notes:
                </label>
                <textarea
                  rows={3}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Enter dispatch directives, rendezvous points, or disposal recycling instructions..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#122e47] text-xs"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowActionModal(false)}
                  className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow transition"
                >
                  {submittingAction ? "Dispatching..." : "Confirm & Deploy Response"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
