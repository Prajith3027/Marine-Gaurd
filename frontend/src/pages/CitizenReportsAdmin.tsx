import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Search,
  Filter,
  MapPin,
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  ExternalLink,
  Shield,
  Sparkles,
  Phone,
  Check,
  Link2,
} from "lucide-react";
import apiService from "../services/api";
import type { CitizenReportItem } from "../types";
import { AuthImage, openAuthMedia } from "../components/ui/AuthMedia";

export default function CitizenReportsAdmin() {
  const [reports, setReports] = useState<CitizenReportItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const [selectedReport, setSelectedReport] = useState<CitizenReportItem | null>(null);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);

  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string>("");
  const [linkIncidentId, setLinkIncidentId] = useState<string>("");

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiService.getCitizenReports({
        status: statusFilter,
        category: categoryFilter,
        page: 1,
        page_size: 100,
      });
      setReports(res.items || []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch citizen reports.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleOpenReview = (report: CitizenReportItem) => {
    setSelectedReport(report);
    setReviewNotes(report.review_notes || "");
    setLinkIncidentId(report.linked_incident_id || "");
    setShowReviewModal(true);
  };

  const handleUpdateStatus = async (newStatus: "SUBMITTED" | "UNDER_REVIEW" | "AI_ASSISTED_VERIFICATION" | "VERIFIED" | "REJECTED") => {
    if (!selectedReport) return;
    try {
      setActionLoading(true);
      const updated = await apiService.updateCitizenReportStatus(selectedReport.id, {
        status: newStatus,
        reviewed_by: "Operations Commander",
        review_notes: reviewNotes.trim() || undefined,
      });
      setSelectedReport(updated);
      setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setActionSuccess(`✓ Status transitioned to ${newStatus.replace(/_/g, " ")}.`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      alert(`Update failed: ${err.message || "Error"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunAiVerify = async (autoCreateIncident = false) => {
    if (!selectedReport) return;
    try {
      setActionLoading(true);
      const updated = await apiService.verifyCitizenReport(selectedReport.id, {
        auto_create_incident: autoCreateIncident,
        link_incident_id: linkIncidentId.trim() || undefined,
        operator_name: "Operations Commander",
      });
      setSelectedReport(updated);
      setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setActionSuccess(
        `✓ AI Verification computed (${updated.verification_confidence}%). Outcome: ${updated.status}.${
          updated.linked_incident_id ? " Incident escalated and linked." : ""
        }`
      );
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      alert(`AI verification failed: ${err.message || "Error"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredReports = reports.filter((r) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.report_code.toLowerCase().includes(term) ||
      r.description.toLowerCase().includes(term) ||
      (r.location_description && r.location_description.toLowerCase().includes(term)) ||
      (r.reporter_name && r.reporter_name.toLowerCase().includes(term))
    );
  });

  const counts = {
    all: reports.length,
    submitted: reports.filter((r) => r.status === "SUBMITTED").length,
    underReview: reports.filter((r) => r.status === "UNDER_REVIEW").length,
    verified: reports.filter((r) => r.status === "VERIFIED").length,
    rejected: reports.filter((r) => r.status === "REJECTED").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "VERIFIED":
        return "bg-[#E8F8F4] text-[#087F68] border-[#B3E7DA]";
      case "REJECTED":
        return "bg-[#FFF1F2] text-[#C6283D] border-[#F5B5BC]";
      case "UNDER_REVIEW":
        return "bg-[#FFF9EB] text-[#A86A00] border-[#F6D88E]";
      case "AI_ASSISTED_VERIFICATION":
        return "bg-[#EAF6FF] text-[#1268B3] border-[#D9E8F2]";
      default:
        return "bg-[#F4F9FD] text-[#5E7183] border-[#D9E8F2]";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in p-4 sm:p-6 pb-24">
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#D9E8F2]">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#0B3A66] tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-[#1268B3]" />
            <span>Citizen &amp; Fisherman Field Reports</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#EAF6FF] text-[#1268B3] font-mono border border-[#D9E8F2]">
              Module 19
            </span>
          </h1>
          <p className="text-xs text-[#5E7183] mt-1">
            Incoming crowd-sourced field observations with AI-assisted verification and emergency incident escalation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchReports}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#F3FAFE] text-[#17324D] border border-[#D9E8F2] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#1268B3] ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <Link
            to="/report"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-lg bg-[#1268B3] hover:bg-[#0F4C81] text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Public Mobile Form</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-[#FFF1F2] border border-[#F5B5BC] text-[#C6283D] text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#C6283D] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 rounded-xl bg-[#E8F8F4] border border-[#B3E7DA] text-[#087F68] text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#087F68] shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Metric Counters Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setStatusFilter("ALL")}
          className={`p-3 rounded-xl border cursor-pointer transition shadow-sm ${
            statusFilter === "ALL" ? "bg-[#EAF6FF] border-[#1268B3]" : "bg-white border-[#D9E8F2] hover:bg-[#F8FBFE]"
          }`}
        >
          <span className="text-[10px] text-[#5E7183] uppercase font-semibold">Total Reports</span>
          <div className="text-xl font-black font-mono text-[#0B3A66] mt-0.5">{counts.all}</div>
        </div>

        <div
          onClick={() => setStatusFilter("SUBMITTED")}
          className={`p-3 rounded-xl border cursor-pointer transition shadow-sm ${
            statusFilter === "SUBMITTED" ? "bg-[#EAF6FF] border-[#1268B3]" : "bg-white border-[#D9E8F2] hover:bg-[#F8FBFE]"
          }`}
        >
          <span className="text-[10px] text-[#1268B3] uppercase font-semibold">New Submitted</span>
          <div className="text-xl font-black font-mono text-[#1268B3] mt-0.5">{counts.submitted}</div>
        </div>

        <div
          onClick={() => setStatusFilter("UNDER_REVIEW")}
          className={`p-3 rounded-xl border cursor-pointer transition shadow-sm ${
            statusFilter === "UNDER_REVIEW" ? "bg-[#FFF9EB] border-[#F6D88E]" : "bg-white border-[#D9E8F2] hover:bg-[#F8FBFE]"
          }`}
        >
          <span className="text-[10px] text-[#A86A00] uppercase font-semibold">Under Review</span>
          <div className="text-xl font-black font-mono text-[#A86A00] mt-0.5">{counts.underReview}</div>
        </div>

        <div
          onClick={() => setStatusFilter("VERIFIED")}
          className={`p-3 rounded-xl border cursor-pointer transition shadow-sm ${
            statusFilter === "VERIFIED" ? "bg-[#E8F8F4] border-[#B3E7DA]" : "bg-white border-[#D9E8F2] hover:bg-[#F8FBFE]"
          }`}
        >
          <span className="text-[10px] text-[#087F68] uppercase font-semibold">Verified Spills</span>
          <div className="text-xl font-black font-mono text-[#087F68] mt-0.5">{counts.verified}</div>
        </div>

        <div
          onClick={() => setStatusFilter("REJECTED")}
          className={`p-3 rounded-xl border cursor-pointer transition shadow-sm ${
            statusFilter === "REJECTED" ? "bg-[#FFF1F2] border-[#F5B5BC]" : "bg-white border-[#D9E8F2] hover:bg-[#F8FBFE]"
          }`}
        >
          <span className="text-[10px] text-[#C6283D] uppercase font-semibold">False Alarms</span>
          <div className="text-xl font-black font-mono text-[#C6283D] mt-0.5">{counts.rejected}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#D9E8F2] shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#8A9AA8] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search report code, description, location..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white border border-[#D9E8F2] text-xs text-[#17324D] placeholder:text-[#8A9AA8] focus:outline-none focus:border-[#1268B3]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-[#5E7183] font-semibold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-[#1268B3]" />
            Category:
          </span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-[#D9E8F2] text-xs text-[#17324D] focus:outline-none focus:border-[#1268B3]"
          >
            <option value="ALL">All Categories</option>
            <option value="SURFACE_SHEEN">Rainbow Sheen</option>
            <option value="TAR_BALLS">Tar Balls</option>
            <option value="HEAVY_BLACK_OIL">Heavy Crude Oil</option>
            <option value="VESSEL_DISCHARGE">Vessel Discharge</option>
            <option value="SHORELINE_COATING">Shoreline Coating</option>
            <option value="OTHER">Other Marine Pollution</option>
          </select>
        </div>
      </div>

      {/* Reports Table & List */}
      {loading ? (
        <div className="p-12 text-center text-xs text-[#5E7183] flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#1268B3]" />
          <span>Loading citizen field reports...</span>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="p-12 rounded-xl bg-white border border-[#D9E8F2] text-center text-xs text-[#5E7183] space-y-2 shadow-sm">
          <p>No citizen reports matching current filter criteria.</p>
          <Link to="/report" target="_blank" className="text-[#1268B3] hover:underline">
            Submit a test report via the mobile form →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#D9E8F2] bg-white shadow-sm">
          <table className="w-full text-left text-xs text-[#17324D]">
            <thead className="bg-[#F4F9FD] text-[#5E7183] font-mono text-[10px] uppercase border-b border-[#D9E8F2]">
              <tr>
                <th className="px-3.5 py-3">Photo</th>
                <th className="px-3.5 py-3">Report Code</th>
                <th className="px-3.5 py-3">Category</th>
                <th className="px-3.5 py-3">Location &amp; Coordinates</th>
                <th className="px-3.5 py-3">Description</th>
                <th className="px-3.5 py-3">Confidence</th>
                <th className="px-3.5 py-3">Status</th>
                <th className="px-3.5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E8F2] font-mono">
              {filteredReports.map((rep) => (
                <tr key={rep.id} className="hover:bg-[#F3FAFE] transition">
                  {/* Photo Thumbnail */}
                  <td className="px-3.5 py-2.5">
                    {rep.photo_url ? (
                      <AuthImage
                        src={rep.photo_url}
                        alt="Evidence"
                        onClick={() => handleOpenReview(rep)}
                        className="w-10 h-10 rounded-lg object-cover border border-[#D9E8F2] hover:border-[#1268B3] transition cursor-pointer shadow-sm"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#F8FBFE] border border-[#D9E8F2] text-[#8A9AA8] flex items-center justify-center">
                        <Camera className="w-4 h-4" />
                      </div>
                    )}
                  </td>

                  {/* Report Code & Timestamp */}
                  <td className="px-3.5 py-2.5">
                    <span className="font-bold text-[#1268B3] block">{rep.report_code}</span>
                    <span className="text-[10px] text-[#5E7183] font-normal">
                      {new Date(rep.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </td>

                  {/* Category */}
                  <td className="px-3.5 py-2.5 font-sans">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#F8FBFE] border border-[#D9E8F2] text-[#17324D]">
                      {rep.incident_category.replace(/_/g, " ")}
                    </span>
                  </td>

                  {/* Location */}
                  <td className="px-3.5 py-2.5 font-sans text-xs">
                    <div className="flex items-center gap-1 font-mono text-[11px] text-[#17324D]">
                      <MapPin className="w-3 h-3 text-[#087F68] shrink-0" />
                      <span>{rep.latitude.toFixed(4)}°N, {rep.longitude.toFixed(4)}°E</span>
                    </div>
                    {rep.location_description && (
                      <span className="text-[10px] text-[#5E7183] block truncate max-w-[150px]">
                        {rep.location_description}
                      </span>
                    )}
                  </td>

                  {/* Description preview */}
                  <td className="px-3.5 py-2.5 font-sans text-xs max-w-xs truncate text-[#5E7183]">
                    {rep.description}
                  </td>

                  {/* AI Verification Confidence */}
                  <td className="px-3.5 py-2.5 font-mono">
                    <span className={`text-xs font-bold ${
                      rep.verification_confidence >= 65
                        ? "text-[#087F68]"
                        : rep.verification_confidence >= 45
                        ? "text-[#A86A00]"
                        : "text-[#5E7183]"
                    }`}>
                      {rep.verification_confidence.toFixed(0)}%
                    </span>
                  </td>

                  {/* Status Badge */}
                  <td className="px-3.5 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getStatusBadge(rep.status)}`}>
                      {rep.status.replace(/_/g, " ")}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-3.5 py-2.5 text-right font-sans">
                    <button
                      onClick={() => handleOpenReview(rep)}
                      className="px-2.5 py-1 rounded bg-white hover:bg-[#F3FAFE] text-[#1268B3] border border-[#1268B3] text-xs font-semibold transition cursor-pointer shadow-xs"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review & Triage Drawer / Modal */}
      {showReviewModal && selectedReport && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="bg-white border border-[#D9E8F2] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-4 text-[#17324D]">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#D9E8F2]">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-[#0B3A66]">
                  Report Dossier: <span className="text-[#1268B3] font-mono">{selectedReport.report_code}</span>
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${getStatusBadge(selectedReport.status)}`}>
                  {selectedReport.status}
                </span>
              </div>
              <button
                onClick={() => setShowReviewModal(false)}
                className="p-1 rounded text-[#5E7183] hover:text-[#17324D] hover:bg-[#F3FAFE] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photo Preview & GPS Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Photo */}
              <div className="bg-[#F8FBFE] p-2 rounded-xl border border-[#D9E8F2] flex items-center justify-center">
                {selectedReport.photo_url ? (
                  <div className="relative group w-full">
                    <AuthImage
                      src={selectedReport.photo_url}
                      alt="Full Evidence"
                      className="w-full h-48 sm:h-56 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => openAuthMedia(selectedReport.photo_url!)}
                      className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 backdrop-blur-sm text-[10px] text-[#4DB8E8] flex items-center gap-1 hover:text-white cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Full Res</span>
                    </button>
                  </div>
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center text-[#8A9AA8] space-y-1">
                    <Camera className="w-8 h-8 opacity-40" />
                    <span className="text-xs">No photographic evidence attached</span>
                  </div>
                )}
              </div>

              {/* Observation & Reporter Info */}
              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-lg bg-[#F8FBFE] border border-[#D9E8F2] space-y-1.5 font-mono">
                  <div className="flex items-center justify-between text-[#5E7183]">
                    <span>GPS Coordinates:</span>
                    <span className="text-[#17324D] font-bold">
                      {selectedReport.latitude.toFixed(5)}°N, {selectedReport.longitude.toFixed(5)}°E
                    </span>
                  </div>
                  {selectedReport.location_description && (
                    <div className="flex items-center justify-between text-[#5E7183]">
                      <span>Area / Landmark:</span>
                      <span className="text-[#1268B3]">{selectedReport.location_description}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[#5E7183]">
                    <span>Observed At:</span>
                    <span className="text-[#17324D]">{new Date(selectedReport.observed_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-[#5E7183]">
                    <span>Estimated Spread:</span>
                    <span className="text-[#17324D]">{selectedReport.estimated_spill_size || "Not specified"}</span>
                  </div>
                </div>

                {/* Reporter Identity (Protected / Private view for Command) */}
                <div className="p-3 rounded-lg bg-[#F4F9FD] border border-[#D9E8F2] space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-[#1268B3] uppercase">
                    <span className="flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      Protected Reporter Profile
                    </span>
                    <span>{selectedReport.reporter_affiliation || "CITIZEN"}</span>
                  </div>
                  <div className="text-[#17324D] font-medium">
                    Name: {selectedReport.reporter_name || "Anonymous Observer"}
                  </div>
                  {selectedReport.reporter_contact && (
                    <div className="text-[#1268B3] font-mono flex items-center gap-1">
                      <Phone className="w-3 h-3 text-[#1268B3]" />
                      {selectedReport.reporter_contact}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Full Description */}
            <div className="p-3 rounded-xl bg-[#F8FBFE] border border-[#D9E8F2] space-y-1">
              <span className="text-[10px] font-bold text-[#5E7183] uppercase tracking-wider block">
                Visual Description &amp; Field Notes:
              </span>
              <p className="text-xs text-[#17324D] leading-relaxed font-sans">
                "{selectedReport.description}"
              </p>
            </div>

            {/* AI Multi-Factor Verification Analysis */}
            <div className="p-3 rounded-xl bg-[#F8FBFE] border border-[#D9E8F2] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1268B3] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#1268B3]" />
                  <span>AI Multi-Factor Verification Engine</span>
                </span>
                <span className="text-sm font-extrabold font-mono text-[#0B3A66]">
                  {selectedReport.verification_confidence.toFixed(1)}% Confidence
                </span>
              </div>
              {selectedReport.ai_analysis_notes ? (
                <p className="text-xs text-[#5E7183] font-sans leading-relaxed">
                  {selectedReport.ai_analysis_notes}
                </p>
              ) : (
                <p className="text-xs text-[#8A9AA8] italic">
                  Not yet evaluated by AI verification engine.
                </p>
              )}

              {selectedReport.linked_incident_id && (
                <div className="flex items-center gap-2 pt-1 font-mono text-xs text-[#087F68]">
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Linked Active Incident ID: {selectedReport.linked_incident_id}</span>
                  <Link to={`/incidents/${selectedReport.linked_incident_id}`} className="text-[#1268B3] underline ml-auto">
                    View Incident Dossier →
                  </Link>
                </div>
              )}
            </div>

            {/* Operational Review Actions */}
            <div className="space-y-3 pt-2 border-t border-[#D9E8F2]">
              <span className="text-xs font-bold text-[#0B3A66] uppercase tracking-wider block">
                Command Workflow Controls
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleUpdateStatus("UNDER_REVIEW")}
                  className="px-3 py-2 rounded-lg bg-white hover:bg-[#FFF9EB] text-[#A86A00] border border-[#F6D88E] text-xs font-bold transition cursor-pointer shadow-xs"
                >
                  Mark Under Review
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleRunAiVerify(false)}
                  className="px-3 py-2 rounded-lg bg-white hover:bg-[#F3FAFE] text-[#1268B3] border border-[#1268B3] text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                >
                  <Sparkles className="w-3 h-3" />
                  Run AI Verify
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleRunAiVerify(true)}
                  className="px-3 py-2 rounded-lg bg-[#087F68] hover:bg-[#066452] text-white text-xs font-bold transition cursor-pointer shadow-md flex items-center justify-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  Verify &amp; Escalate
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleUpdateStatus("REJECTED")}
                  className="px-3 py-2 rounded-lg bg-[#C6283D] hover:bg-[#A31D30] text-white text-xs font-bold transition cursor-pointer shadow-md"
                >
                  Reject / False Alarm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
