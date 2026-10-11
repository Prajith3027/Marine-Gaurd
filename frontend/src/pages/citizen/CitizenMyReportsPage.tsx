import { useEffect, useState } from "react";
import {
  FileText,
  Clock,
  Eye,
  X,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { citizenApi } from "../../services/citizenApi";
import type { CitizenReportItem } from "../../types/auth";
import { MarineLoader } from "../../components/ui/MarineLoader";
import { AuthImage, AuthVideo } from "../../components/ui/AuthMedia";

export default function CitizenMyReportsPage() {
  const [reports, setReports] = useState<CitizenReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<CitizenReportItem | null>(null);

  useEffect(() => {
    async function fetchReports() {
      try {
        const data = await citizenApi.getMyReports();
        setReports(data);
      } catch (err) {
        console.error("Failed to load my reports", err);
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, []);

  const handleOpenDetail = async (id: string) => {
    try {
      const full = await citizenApi.getMyReport(id);
      setSelectedReport(full);
    } catch (err) {
      console.error("Failed to fetch report detail", err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUBMITTED":
        return <span className="badge badge-info text-[9px]">Submitted</span>;
      case "UNDER_REVIEW":
        return <span className="badge badge-warning text-[9px]">Under Review</span>;
      case "VERIFIED":
        return <span className="badge badge-success text-[9px]">Verified</span>;
      case "INVESTIGATION_STARTED":
        return (
          <span className="badge badge-warning bg-amber-500/20 text-amber-300 border-amber-500/40 text-[9px]">
            Investigation Started
          </span>
        );
      case "RESOLVED":
        return (
          <span className="badge badge-success bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[9px]">
            Resolved
          </span>
        );
      case "REJECTED":
        return <span className="badge badge-danger text-[9px]">Rejected</span>;
      default:
        return <span className="badge text-[9px]">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <MarineLoader text="Retrieving Submitted Reports..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-[#17324D] dark:text-white flex items-center gap-2">
          <FileText className="w-6 h-6 text-[#0066b2] dark:text-[#00f3ff]" />
          <span>My Reported Incidents</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Track lifecycle review stages, verification milestones, and public authority remarks for
          your reports.
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] space-y-3">
          <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
          <h2 className="text-sm font-bold text-[#17324D] dark:text-white">No Reports Submitted</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            When you submit visual oil spill or sheen reports from the field, they will appear here
            with real-time authority timeline updates.
          </p>
        </div>
      ) : (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[11px] text-slate-400 uppercase border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-3">Report ID</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Location</th>
                  <th className="py-3 px-3">Severity</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reports.map((r) => {
                  const dateStr = new Date(r.observed_at).toLocaleDateString();
                  return (
                    <tr
                      key={r.id}
                      onClick={() => handleOpenDetail(r.id)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition"
                    >
                      <td className="py-3.5 px-3 font-mono font-bold text-[#0066b2] dark:text-[#00f3ff]">
                        {r.report_code}
                      </td>
                      <td className="py-3.5 px-3 text-slate-500 dark:text-slate-400">{dateStr}</td>
                      <td className="py-3.5 px-3 font-semibold text-[#17324D] dark:text-white max-w-[200px] truncate">
                        {r.location_description || `${r.latitude.toFixed(2)}°, ${r.longitude.toFixed(2)}°`}
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`badge text-[9px] ${
                            r.severity === "CRITICAL"
                              ? "badge-danger"
                              : r.severity === "HIGH"
                              ? "badge-warning"
                              : "badge-info"
                          }`}
                        >
                          {r.severity}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">{getStatusBadge(r.status)}</td>
                      <td className="py-3.5 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(r.id);
                          }}
                          className="p-1.5 rounded-lg bg-[#EAF6FF] dark:bg-[#12385c] text-[#0066b2] dark:text-[#00f3ff] hover:bg-[#0066b2] hover:text-white transition"
                          title="View Report Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-2xl p-6 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono text-slate-400">INCIDENT DOSSIER</span>
                <h2 className="text-lg font-black text-[#17324D] dark:text-white flex items-center gap-2">
                  <span className="font-mono text-[#0066b2] dark:text-[#00f3ff]">
                    {selectedReport.report_code}
                  </span>
                  {getStatusBadge(selectedReport.status)}
                </h2>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Public Remarks Banner if set */}
            {selectedReport.public_remarks && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Authority Remarks (Coast Guard / MRCC)</span>
                </div>
                <p className="leading-relaxed">{selectedReport.public_remarks}</p>
              </div>
            )}

            {/* Quick Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#F4F9FD] dark:bg-[#071521] border border-[#D9E8F2] dark:border-[#1a3854]">
                <span className="text-[10px] text-slate-500">Date Observed</span>
                <p className="font-bold text-[#17324D] dark:text-white mt-0.5">
                  {new Date(selectedReport.observed_at).toLocaleDateString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#F4F9FD] dark:bg-[#071521] border border-[#D9E8F2] dark:border-[#1a3854]">
                <span className="text-[10px] text-slate-500">Coordinates</span>
                <p className="font-mono font-bold text-[#17324D] dark:text-white mt-0.5">
                  {selectedReport.latitude.toFixed(3)}°, {selectedReport.longitude.toFixed(3)}°
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#F4F9FD] dark:bg-[#071521] border border-[#D9E8F2] dark:border-[#1a3854]">
                <span className="text-[10px] text-slate-500">Category</span>
                <p className="font-bold text-[#17324D] dark:text-white mt-0.5 truncate">
                  {selectedReport.incident_category.replace(/_/g, " ")}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#F4F9FD] dark:bg-[#071521] border border-[#D9E8F2] dark:border-[#1a3854]">
                <span className="text-[10px] text-slate-500">Severity</span>
                <p className="font-bold text-[#17324D] dark:text-white mt-0.5">
                  {selectedReport.severity}
                </p>
              </div>
            </div>

            {/* Location & Description */}
            <div className="space-y-2 text-xs">
              <div>
                <span className="font-bold text-slate-500">Location:</span>{" "}
                <span className="font-semibold text-[#17324D] dark:text-white">
                  {selectedReport.location_description || "Not specified"}
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-500 block mb-1">Field Observation:</span>
                <p className="p-3 rounded-xl bg-[#F4F9FD] dark:bg-[#071521] border border-[#D9E8F2] dark:border-[#1a3854] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {selectedReport.description}
                </p>
              </div>
            </div>

            {/* Media Evidence */}
            {(selectedReport.photo_url || selectedReport.video_url) && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Submitted Evidence Media
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedReport.photo_url && (
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
                      <AuthImage
                        src={selectedReport.photo_url}
                        alt="Submitted evidence"
                        className="w-full h-44 object-contain"
                      />
                    </div>
                  )}
                  {selectedReport.video_url && (
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black flex items-center justify-center">
                      <AuthVideo
                        src={selectedReport.video_url}
                        className="w-full h-44 object-contain"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Public Timeline */}
            {selectedReport.timeline && selectedReport.timeline.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#0066b2] dark:text-[#00f3ff]" />
                  <span>Authority Review Timeline</span>
                </span>
                <div className="space-y-2.5">
                  {selectedReport.timeline.map((evt, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-[#F4F9FD] dark:bg-[#071521] border border-[#D9E8F2] dark:border-[#1a3854] flex items-start gap-3 text-xs"
                    >
                      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950 text-[#0066b2] dark:text-[#00f3ff] flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#17324D] dark:text-white">
                            {evt.status.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(evt.at).toLocaleString()}
                          </span>
                        </div>
                        {evt.note && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300">
                            {evt.note}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedReport(null)}
                className="btn-primary text-xs py-2 px-5 font-bold"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
