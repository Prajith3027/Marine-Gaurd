import { useEffect, useState, useCallback } from "react";
import {
  FileText,
  Search,
  CheckCircle2,
  X,
  ExternalLink,
  Shield,
  Eye,
  Video,
  Clock,
  MapPin,
  Sparkles,
  Phone,
  User as UserIcon,
} from "lucide-react";
import { adminApi } from "../../services/adminApi";
import type { AdminCitizenReport } from "../../types/auth";
import { MarineLoader } from "../../components/ui/MarineLoader";
import { AuthImage, AuthVideo, openAuthMedia } from "../../components/ui/AuthMedia";

export default function AdminCitizenReportsPage() {
  const [reports, setReports] = useState<AdminCitizenReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedReport, setSelectedReport] = useState<AdminCitizenReport | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [reviewNotes, setReviewNotes] = useState("");
  const [publicRemarks, setPublicRemarks] = useState("");

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApi.getReports(statusFilter === "ALL" ? undefined : statusFilter);
      setReports(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load citizen reports");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const openDossier = (report: AdminCitizenReport) => {
    setSelectedReport(report);
    setReviewNotes(report.review_notes || "");
    setPublicRemarks(report.public_remarks || "");
    setActionSuccess(null);
    setShowModal(true);
  };

  const handleAction = async (
    action: "review" | "verify" | "reject" | "start_investigation" | "resolve"
  ) => {
    if (!selectedReport) return;
    try {
      setActionLoading(true);
      setActionSuccess(null);
      const updated = await adminApi.reportAction(selectedReport.id, {
        action,
        notes: reviewNotes,
        public_remarks: publicRemarks,
        run_ai_check: true,
        create_incident: action === "verify" || action === "start_investigation",
      });
      setSelectedReport(updated);
      setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setActionSuccess(`Successfully updated report status to ${updated.status}`);
    } catch (err: any) {
      alert("Error updating report: " + (err?.message || "Action failed"));
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = reports.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.id.toLowerCase().includes(q) ||
      (r.description && r.description.toLowerCase().includes(q)) ||
      (r.location_description && r.location_description.toLowerCase().includes(q)) ||
      (r.citizen && r.citizen.toLowerCase().includes(q)) ||
      (r.reporter_contact && r.reporter_contact.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "VERIFIED":
        return <span className="badge badge-success text-[10px]">VERIFIED</span>;
      case "REJECTED":
        return <span className="badge badge-critical text-[10px]">REJECTED</span>;
      case "UNDER_REVIEW":
        return <span className="badge badge-warning text-[10px]">UNDER REVIEW</span>;
      case "INVESTIGATION_STARTED":
        return <span className="badge badge-warning text-[10px]">INVESTIGATION</span>;
      case "RESOLVED":
        return <span className="badge badge-info text-[10px]">RESOLVED</span>;
      default:
        return <span className="badge text-[10px] bg-slate-200 text-slate-800">SUBMITTED</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="badge badge-info text-[10px] font-mono">
              OFFICIAL VERIFICATION QUEUE
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              PRIVACY COMPLIANT (ADMIN VIEW)
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[#17324D] dark:text-white mt-1">
            Citizen Maritime Reports Management
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Triage crowdsourced pollution observations, inspect photographic &amp; video evidence, review
            AI-assisted computer vision verification flags, and dispatch incidents to Coast Guard command.
          </p>
        </div>

        <button
          onClick={loadReports}
          className="btn-secondary text-xs flex items-center gap-2 py-2 px-3.5"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#10273d] border border-slate-200 dark:border-[#1c3e5e]">
          {["ALL", "SUBMITTED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "RESOLVED"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                statusFilter === s
                  ? "bg-[#1268B3] text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#183955]"
              }`}
            >
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search submitter, location, text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D9E8F2] dark:border-[#1a3854] bg-white dark:bg-[#0c1f33] text-[#17324D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1268B3]"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <MarineLoader text="Loading crowdsourced reports..." />
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] text-slate-400">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="font-semibold text-sm">No citizen reports match the selected filters.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#0c1f33] rounded-2xl border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#10273d] text-slate-500 dark:text-slate-400 border-b border-[#D9E8F2] dark:border-[#1a3854] font-bold">
                <tr>
                  <th className="py-3 px-4">Report Code</th>
                  <th className="py-3 px-4">Submitter</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Media</th>
                  <th className="py-3 px-4">AI Score</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#16334d]">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-[#122b42] transition"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-[#1268B3]">
                      #{r.report_code || r.id.slice(0, 8)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#17324D] dark:text-white">
                        {r.citizen || "Citizen Reporter"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {r.reporter_contact || "Confidential Contact"}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="truncate max-w-[180px] font-medium text-slate-700 dark:text-slate-300">
                        {r.location_description || "Offshore Coordinates"}
                      </div>
                      {r.latitude && r.longitude && (
                        <div className="text-[10px] font-mono text-slate-400">
                          {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`badge text-[9px] ${
                          r.severity === "CRITICAL" || r.severity === "HIGH"
                            ? "badge-critical"
                            : r.severity === "MEDIUM"
                            ? "badge-warning"
                            : "badge-info"
                        }`}
                      >
                        {r.severity || "MEDIUM"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        {r.photo_url && (
                          <span
                            className="p-1 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                            title="Contains Photo"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {r.video_url && (
                          <span
                            className="p-1 rounded bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300"
                            title="Contains Video"
                          >
                            <Video className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {!r.photo_url && !r.video_url && (
                          <span className="text-slate-400 text-[10px]">None</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {r.verification_confidence > 0 ? (
                        <span className="badge badge-success text-[9px] flex items-center gap-1 w-fit">
                          <Sparkles className="w-3 h-3" />
                          <span>{(r.verification_confidence * 100).toFixed(0)}%</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(r.status)}</td>
                    <td className="py-3 px-4 text-slate-400 text-[10px]">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : "Recent"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => openDossier(r)}
                        className="py-1.5 px-3 rounded-lg bg-[#1268B3] hover:bg-[#0e528e] text-white font-bold text-xs shadow-sm transition inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Review Dossier</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Dossier Modal */}
      {showModal && selectedReport && (
        <div className="fixed inset-0 bg-[#00172e]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-[#0c1f33] rounded-2xl max-w-3xl w-full border border-[#D9E8F2] dark:border-[#1a3854] shadow-2xl p-6 space-y-6 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#16334d]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-info text-[10px] font-mono">
                    REPORT #{selectedReport.report_code || selectedReport.id.slice(0, 8)}
                  </span>
                  {getStatusBadge(selectedReport.status)}
                </div>
                <h2 className="text-lg font-black text-[#17324D] dark:text-white mt-1">
                  Citizen Report Forensic Investigation
                </h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-[#143049] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Submitter & Location Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#10273d] border border-slate-200 dark:border-[#1c3e5e] space-y-2 text-xs">
                <div className="font-bold text-[#17324D] dark:text-white flex items-center gap-1.5">
                  <UserIcon className="w-4 h-4 text-[#1268B3]" />
                  <span>Submitter Identity (Admin Authorized View)</span>
                </div>
                <div className="space-y-1 text-slate-600 dark:text-slate-300">
                  <p>
                    <span className="text-slate-400">Citizen:</span>{" "}
                    <strong className="text-[#17324D] dark:text-white">
                      {selectedReport.citizen || "Citizen Reporter"}
                    </strong>
                  </p>
                  {selectedReport.reporter_contact && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{selectedReport.reporter_contact}</span>
                    </p>
                  )}
                  <p>
                    <span className="text-slate-400">Category:</span>{" "}
                    <span className="badge badge-info text-[9px] uppercase">
                      {selectedReport.incident_category}
                    </span>
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#10273d] border border-slate-200 dark:border-[#1c3e5e] space-y-2 text-xs">
                <div className="font-bold text-[#17324D] dark:text-white flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#1268B3]" />
                  <span>Geographic Location</span>
                </div>
                <div className="space-y-1 text-slate-600 dark:text-slate-300">
                  <p>
                    <span className="text-slate-400">Landmark / Text:</span>{" "}
                    <strong>
                      {selectedReport.location_description || "Unspecified coastal region"}
                    </strong>
                  </p>
                  {selectedReport.latitude && selectedReport.longitude && (
                    <p className="font-mono text-[11px] text-[#1268B3] dark:text-[#00f3ff]">
                      Lat: {selectedReport.latitude.toFixed(6)} | Lon:{" "}
                      {selectedReport.longitude.toFixed(6)}
                    </p>
                  )}
                  <p>
                    <span className="text-slate-400">Observed Time:</span>{" "}
                    <span>
                      {selectedReport.observed_at
                        ? new Date(selectedReport.observed_at).toLocaleString()
                        : "N/A"}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Description & Category */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#10273d] border border-slate-200 dark:border-[#1c3e5e] text-xs space-y-2">
              <div className="font-bold text-[#17324D] dark:text-white">Observation Report</div>
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {selectedReport.description}
              </p>
            </div>

            {/* Evidence Media Section */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Submitted Photographic &amp; Video Media
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedReport.photo_url ? (
                  <div className="border border-slate-200 dark:border-[#1c3e5e] rounded-xl overflow-hidden bg-black/5 flex flex-col">
                    <div className="p-2 bg-slate-100 dark:bg-[#10273d] text-[10px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
                      <span>Field Photo</span>
                      <button
                        type="button"
                        onClick={() => openAuthMedia(selectedReport.photo_url!)}
                        className="text-[#1268B3] flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open Original</span>
                      </button>
                    </div>
                    <AuthImage
                      src={selectedReport.photo_url}
                      alt="Field evidence"
                      className="w-full h-48 object-cover"
                    />
                  </div>
                ) : (
                  <div className="p-8 border border-dashed border-slate-200 dark:border-[#1c3e5e] rounded-xl text-center text-xs text-slate-400">
                    No photo evidence submitted
                  </div>
                )}

                {selectedReport.video_url ? (
                  <div className="border border-slate-200 dark:border-[#1c3e5e] rounded-xl overflow-hidden bg-black/5 flex flex-col">
                    <div className="p-2 bg-slate-100 dark:bg-[#10273d] text-[10px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
                      <span>Video Recording</span>
                      <button
                        type="button"
                        onClick={() => openAuthMedia(selectedReport.video_url!)}
                        className="text-[#1268B3] flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Direct Link</span>
                      </button>
                    </div>
                    <AuthVideo
                      src={selectedReport.video_url}
                      className="w-full h-48 bg-black object-contain"
                    />
                  </div>
                ) : (
                  <div className="p-8 border border-dashed border-slate-200 dark:border-[#1c3e5e] rounded-xl text-center text-xs text-slate-400">
                    No video evidence submitted
                  </div>
                )}
              </div>
            </div>

            {/* Admin Action Controls */}
            <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-[#0a233b] border border-blue-100 dark:border-[#18446b] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#17324D] dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-[#1268B3]" />
                  <span>Authority Action &amp; Citizen Communication</span>
                </h3>
                {actionSuccess && (
                  <span className="text-xs text-emerald-600 font-bold">{actionSuccess}</span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Internal Investigation Notes (Private to Admin)
                  </label>
                  <textarea
                    rows={3}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Enter confidential tactical notes, dispatch unit identifiers, or validation checks..."
                    className="w-full p-2.5 rounded-lg border border-[#D9E8F2] dark:border-[#1a3854] bg-white dark:bg-[#0c1f33] text-[#17324D] dark:text-white text-xs focus:ring-2 focus:ring-[#1268B3]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Public Remarks (Visible to Citizen Submitter)
                  </label>
                  <textarea
                    rows={3}
                    value={publicRemarks}
                    onChange={(e) => setPublicRemarks(e.target.value)}
                    placeholder="e.g. Coast Guard Sector 4 dispatched boom deployment at 14:30. Thank you for your alert."
                    className="w-full p-2.5 rounded-lg border border-[#D9E8F2] dark:border-[#1a3854] bg-white dark:bg-[#0c1f33] text-[#17324D] dark:text-white text-xs focus:ring-2 focus:ring-[#1268B3]"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleAction("reject")}
                  className="px-3.5 py-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 font-bold text-xs transition"
                >
                  Reject Report
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleAction("review")}
                  className="px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-xs transition"
                >
                  Mark Under Review
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleAction("start_investigation")}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition"
                >
                  Start Investigation
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleAction("verify")}
                  className="px-4 py-2 rounded-xl bg-[#087F68] hover:bg-[#066452] text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify &amp; Create Incident</span>
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleAction("resolve")}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
                >
                  Mark Resolved
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
