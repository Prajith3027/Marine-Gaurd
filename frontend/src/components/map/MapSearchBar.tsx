import { useState, useMemo } from "react";
import { Search, Flame, X, Filter } from "lucide-react";
import type { MapIncidentPoint, IncidentSeverity } from "../../types";

export type GISModuleFilter = "ALL" | "OIL_SPILL" | "MARINE_WASTE";

interface MapSearchBarProps {
  incidents: MapIncidentPoint[];
  selectedIncident: MapIncidentPoint | null;
  onSelectIncident: (incident: MapIncidentPoint) => void;
  severityFilter: IncidentSeverity | "ALL";
  onSeverityFilterChange: (sev: IncidentSeverity | "ALL") => void;
  moduleFilter?: GISModuleFilter;
  onModuleFilterChange?: (mod: GISModuleFilter) => void;
}

export const MapSearchBar: React.FC<MapSearchBarProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  severityFilter,
  onSeverityFilterChange,
  moduleFilter = "ALL",
  onModuleFilterChange,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      const matchesSearch =
        !searchTerm ||
        inc.incident_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inc.description && inc.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesSeverity = severityFilter === "ALL" || inc.severity === severityFilter;
      return matchesSearch && matchesSeverity;
    });
  }, [incidents, searchTerm, severityFilter]);

  const handleModuleClick = (mod: GISModuleFilter) => {
    onModuleFilterChange?.(mod);
  };

  const handleSeverityClick = (sev: IncidentSeverity | "ALL") => {
    onSeverityFilterChange(sev);
  };

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-2xl px-4 pointer-events-auto">
      <div className="bg-white/95 dark:bg-[#0c1f33]/95 backdrop-blur-md border border-[#D9E8F2] dark:border-[#1a3854] rounded-2xl p-2.5 shadow-2xl flex flex-col gap-2">
        {/* Top: Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#8A9AA8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search GIS coordinates, incidents (e.g. DEMO-INC-001, MW-20261008-001)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 250)}
            className="w-full pl-9 pr-8 py-2 bg-[#F8FCFF] dark:bg-[#122e47] border border-[#D9E8F2] dark:border-[#1a3854] rounded-xl text-xs text-[#17324D] dark:text-white placeholder-[#8A9AA8] focus:outline-none focus:border-[#1268B3] transition font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A9AA8] hover:text-[#17324D] dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Bottom: Fast Filter Ribbon */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Filter className="w-3 h-3 text-slate-400" />
              Filters:
            </span>

            {/* [All] */}
            <button
              type="button"
              onClick={() => {
                handleModuleClick("ALL");
                handleSeverityClick("ALL");
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                moduleFilter === "ALL" && severityFilter === "ALL"
                  ? "bg-[#1268B3] text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              <span>All</span>
            </button>

            {/* [🛢️ Oil Spill] */}
            <button
              type="button"
              onClick={() => handleModuleClick("OIL_SPILL")}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                moduleFilter === "OIL_SPILL"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 border border-amber-500/20"
              }`}
            >
              <span>🛢️ Oil Spill</span>
            </button>

            {/* [♻️ Marine Waste] */}
            <button
              type="button"
              onClick={() => handleModuleClick("MARINE_WASTE")}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                moduleFilter === "MARINE_WASTE"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/20"
              }`}
            >
              <span>♻️ Marine Waste</span>
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-1" />

            {/* [Critical] */}
            <button
              type="button"
              onClick={() => handleSeverityClick(severityFilter === "CRITICAL" ? "ALL" : "CRITICAL")}
              className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 ${
                severityFilter === "CRITICAL"
                  ? "bg-red-600 text-white shadow-xs"
                  : "bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border border-red-500/20"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span>Critical</span>
            </button>

            {/* [High] */}
            <button
              type="button"
              onClick={() => handleSeverityClick(severityFilter === "HIGH" ? "ALL" : "HIGH")}
              className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 ${
                severityFilter === "HIGH"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>High</span>
            </button>
          </div>
        </div>

        {/* Dropdown for search results when typing */}
        {isFocused && searchTerm.trim().length > 0 && (
          <div className="bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] rounded-xl max-h-48 overflow-y-auto mt-1 p-1 space-y-1 shadow-2xl">
            {filteredIncidents.length > 0 ? (
              filteredIncidents.map((inc) => (
                <button
                  key={inc.id}
                  onMouseDown={() => {
                    onSelectIncident(inc);
                    setSearchTerm("");
                  }}
                  className={`w-full text-left p-2 rounded-lg hover:bg-[#F3FAFE] dark:hover:bg-[#122e47] transition flex items-center justify-between text-xs cursor-pointer ${
                    selectedIncident?.id === inc.id ? "bg-[#EAF6FF] dark:bg-[#122e47] border border-[#A9D9F5]" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Flame
                      className={`w-3.5 h-3.5 ${
                        inc.severity === "CRITICAL"
                          ? "text-[#C6283D]"
                          : inc.severity === "HIGH"
                          ? "text-[#A86A00]"
                          : inc.severity === "MODERATE"
                          ? "text-[#A86A00]"
                          : "text-[#1268B3]"
                      }`}
                    />
                    <div>
                      <div className="font-bold text-[#17324D] dark:text-white">
                        {inc.incident_code}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[280px]">
                        {inc.description || "Active Oil Spill Incident Point"}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase ${
                      inc.severity === "CRITICAL"
                        ? "bg-red-100 text-red-700"
                        : inc.severity === "HIGH"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {inc.severity}
                  </span>
                </button>
              ))
            ) : (
              <div className="p-3 text-center text-xs text-slate-400">
                No matching incidents found for "{searchTerm}"
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
