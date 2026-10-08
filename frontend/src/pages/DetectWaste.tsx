import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Upload,
  Waves,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Eye,
  Crosshair,
  Anchor,
  Layers,
  Info,
} from "lucide-react";
import { wasteApi, type WasteDetectionResponse } from "../services/wasteApi";
import { MarineLoader } from "../components/ui/MarineLoader";

interface WastePreset {
  id: string;
  name: string;
  category: string;
  wasteType: string;
  latitude: number;
  longitude: number;
  locationName: string;
  description: string;
  sampleCanvasColor: string;
}

const WASTE_PRESETS: WastePreset[] = [
  {
    id: "gulf_ghost_net",
    name: "Ghost Fishing Net (Gulf of Mannar)",
    category: "Coral Reef Submerged Netting",
    wasteType: "FISHING_NETS",
    latitude: 9.2876,
    longitude: 79.3129,
    locationName: "Gulf of Mannar Marine Biosphere",
    description: "Discarded nylon monofilament trawl net snagged on reef crest with severe entanglement risk to sea turtles and dugongs.",
    sampleCanvasColor: "#064e3b",
  },
  {
    id: "marina_plastics",
    name: "Tidal Plastic Bottles (Marina Beach)",
    category: "Coastal High-Tide Accumulation",
    wasteType: "PLASTIC_BOTTLES",
    latitude: 13.0500,
    longitude: 80.2824,
    locationName: "Marina Beach Tide Line, Chennai",
    description: "High concentration of buoyant single-use PET drink containers and caps washed ashore along the Coromandel coast.",
    sampleCanvasColor: "#0f766e",
  },
  {
    id: "mumbai_harbor_debris",
    name: "Industrial Marine Debris (Mumbai Approach)",
    category: "Port Approach Hazard",
    wasteType: "MARINE_DEBRIS",
    latitude: 18.9300,
    longitude: 72.8200,
    locationName: "Mumbai Commercial Harbor Channel",
    description: "Heavy floating timber, cargo dunnage, and discarded synthetic bulk packaging posing propellor entanglement hazards.",
    sampleCanvasColor: "#334155",
  },
  {
    id: "palk_floating_polymers",
    name: "Dispersed Floating Plastic (Palk Strait)",
    category: "Nearshore Sachet & Film Slick",
    wasteType: "FLOATING_PLASTIC",
    latitude: 9.6000,
    longitude: 79.2000,
    locationName: "Palk Strait Shallow Corridor",
    description: "Dispersed macroplastic packaging film slick hovering over critical seagrass bed foraging zones.",
    sampleCanvasColor: "#0369a1",
  },
];

export default function DetectWaste() {
  const [activeTab, setActiveTab] = useState<"preset" | "upload">("preset");
  const [selectedPreset, setSelectedPreset] = useState<WastePreset>(WASTE_PRESETS[0]);

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Location inputs
  const [latitude, setLatitude] = useState<number>(WASTE_PRESETS[0].latitude);
  const [longitude, setLongitude] = useState<number>(WASTE_PRESETS[0].longitude);
  const [locationName, setLocationName] = useState<string>(WASTE_PRESETS[0].locationName);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [result, setResult] = useState<WasteDetectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMask, setShowMask] = useState<boolean>(true);
  const [escalatedCode, setEscalatedCode] = useState<string | null>(null);
  const [escalating, setEscalating] = useState<boolean>(false);

  const handlePresetSelect = (preset: WastePreset) => {
    setSelectedPreset(preset);
    setLatitude(preset.latitude);
    setLongitude(preset.longitude);
    setLocationName(preset.locationName);
    setResult(null);
    setEscalatedCode(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setUploadedFile(f);
      setUploadedPreview(URL.createObjectURL(f));
      setResult(null);
      setEscalatedCode(null);
    }
  };

  // Helper to generate synthetic test canvas image from preset for live model inference
  const generatePresetBlob = async (preset: WastePreset): Promise<Blob> => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    // Draw realistic coastal water gradient
    const grad = ctx.createLinearGradient(0, 0, 400, 300);
    grad.addColorStop(0, "#083344");
    grad.addColorStop(1, "#0e7490");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 300);

    // Draw debris shapes matching the preset
    if (preset.wasteType === "FISHING_NETS") {
      ctx.strokeStyle = "#fef08a";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 20; i++) {
        ctx.beginPath();
        ctx.moveTo(100 + i * 8, 80);
        ctx.lineTo(80 + i * 10, 220);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(80, 100 + i * 6);
        ctx.lineTo(260, 90 + i * 7);
        ctx.stroke();
      }
    } else if (preset.wasteType === "PLASTIC_BOTTLES") {
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 12; i++) {
        ctx.fillRect(120 + (i % 4) * 35, 110 + Math.floor(i / 4) * 40, 24, 10);
      }
    } else {
      ctx.fillStyle = "#f97316";
      ctx.fillRect(140, 100, 80, 50);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(180, 130, 90, 45);
    }

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
  };

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setEscalatedCode(null);

    try {
      const formData = new FormData();
      formData.append("latitude", latitude.toString());
      formData.append("longitude", longitude.toString());

      if (activeTab === "upload" && uploadedFile) {
        formData.append("image", uploadedFile);
      } else {
        const sampleBlob = await generatePresetBlob(selectedPreset);
        formData.append("image", sampleBlob, `${selectedPreset.id}.png`);
      }

      const res = await wasteApi.detect(formData);
      setResult(res);
    } catch (err: any) {
      setError(err?.detail || err?.message || "Failed to complete AI Marine Waste detection.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleEscalateIncident = async () => {
    if (!result) return;
    setEscalating(true);
    try {
      const inc = await wasteApi.createIncident({
        waste_type: result.waste_type,
        density: result.density,
        estimated_area_m2: result.estimated_area_m2,
        estimated_items_count: result.estimated_items_count,
        latitude: latitude,
        longitude: longitude,
        location_name: locationName,
        entanglement_hazard: result.entanglement_hazard,
        navigation_hazard: result.navigation_hazard,
        mask_overlay_url: result.mask_overlay_base64,
      });
      setEscalatedCode(inc.incident_code);
    } catch (err: any) {
      alert("Failed to escalate incident: " + (err?.detail || err?.message));
    } finally {
      setEscalating(false);
    }
  };

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
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#00382b] via-[#00523f] to-[#047857] text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-emerald-400/30">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="badge bg-emerald-400/20 text-emerald-200 border-emerald-400/30 text-[10px] font-mono">
              AI VISION DEBRIS ENGINE
            </span>
            <span className="text-emerald-200 text-xs font-mono">• REAL INFERENCE PIPELINE</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
            <Waves className="w-7 h-7 text-emerald-300" />
            <span>AI Marine Waste &amp; Debris Detection Studio</span>
          </h1>
          <p className="text-xs text-emerald-100 max-w-2xl leading-relaxed">
            Multi-spectral coastal polymer segmentation, fishing net entanglement risk scoring,
            density calculations, and transparent 5-factor pollution index assessment.
          </p>
        </div>

        <Link
          to="/admin/waste"
          className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-white text-emerald-950 font-bold text-xs uppercase tracking-wider shadow-md hover:bg-emerald-50 transition shrink-0"
        >
          <Layers className="w-4 h-4 text-emerald-700" />
          <span>Waste Command Desk</span>
        </Link>
      </div>

      {/* Main Analysis Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="p-5 rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm space-y-4">
            {/* Tab Selector */}
            <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-[#122e47] border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab("preset")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                  activeTab === "preset"
                    ? "bg-white dark:bg-[#004d3d] text-emerald-700 dark:text-emerald-300 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Coastal Presets
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("upload")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                  activeTab === "upload"
                    ? "bg-white dark:bg-[#004d3d] text-emerald-700 dark:text-emerald-300 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Upload Drone/Photo
              </button>
            </div>

            {/* Presets List */}
            {activeTab === "preset" && (
              <div className="space-y-2.5">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Select Demonstration Scenario:
                </p>
                <div className="space-y-2">
                  {WASTE_PRESETS.map((p) => {
                    const active = selectedPreset.id === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handlePresetSelect(p)}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                          active
                            ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 shadow-sm"
                            : "bg-white dark:bg-[#0d2238] border-slate-200 dark:border-slate-800 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-[#17324D] dark:text-white">{p.name}</p>
                          <span className="text-[10px] font-mono py-0.5 px-2 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold">
                            {p.wasteType}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {p.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Upload Box */}
            {activeTab === "upload" && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-6 border-2 border-dashed border-emerald-400/60 dark:border-emerald-600/40 rounded-xl flex flex-col items-center justify-center text-center cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition"
                >
                  <Upload className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mb-2" />
                  <p className="text-xs font-bold text-[#17324D] dark:text-white">
                    {uploadedFile ? uploadedFile.name : "Click to select drone or aerial image"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Supports PNG, JPG, WEBP up to 20MB</p>
                </div>
                {uploadedPreview && (
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 h-36">
                    <img src={uploadedPreview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            )}

            {/* GPS & Sector Inputs */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Latitude (°N)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={latitude}
                  onChange={(e) => setLatitude(parseFloat(e.target.value))}
                  className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#122e47] text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Longitude (°E)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={longitude}
                  onChange={(e) => setLongitude(parseFloat(e.target.value))}
                  className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#122e47] text-xs font-mono"
                />
              </div>
            </div>

            {/* Action Button */}
            <button
              type="button"
              onClick={handleRunAnalysis}
              disabled={isAnalyzing}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Executing Vision AI Inference...</span>
                </>
              ) : (
                <>
                  <Crosshair className="w-4 h-4" />
                  <span>Analyze Imagery with Waste AI</span>
                </>
              )}
            </button>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Output & Results (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {!result && !isAnalyzing && (
            <div className="h-96 rounded-2xl bg-white dark:bg-[#0c1f33] border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <Eye className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Awaiting Image Input</p>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Select a scenario or upload a coastal drone photograph and click "Analyze Imagery with Waste AI".
              </p>
            </div>
          )}

          {isAnalyzing && (
            <div className="h-96 rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] flex items-center justify-center">
              <MarineLoader text="Running Multi-Spectral Polymer & Netting Analysis..." />
            </div>
          )}

          {result && (
            <div className="space-y-5 animate-fade-in">
              {/* Main Result Card */}
              <div className="p-5 rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest font-mono">
                      AI DETECTION VERIFIED
                    </span>
                    <h2 className="text-xl font-black text-[#17324D] dark:text-white">
                      {result.waste_type.replace(/_/g, " ")}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`py-1 px-3 rounded-full text-xs font-black border ${getSeverityBadge(result.severity)}`}>
                      {result.severity} SEVERITY
                    </span>
                    <span className={`py-1 px-3 rounded-full text-xs font-black shadow-sm ${getPriorityBadge(result.cleanup_priority)}`}>
                      {result.cleanup_priority}
                    </span>
                  </div>
                </div>

                {/* Visual Overlay Visualizer */}
                {result.mask_overlay_base64 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-600 dark:text-slate-300">Segmentation Heatmap:</span>
                      <button
                        type="button"
                        onClick={() => setShowMask(!showMask)}
                        className="text-[11px] text-emerald-600 hover:underline font-bold"
                      >
                        {showMask ? "Hide Highlight Overlay" : "Show Highlight Overlay"}
                      </button>
                    </div>
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 h-64 bg-slate-900 flex items-center justify-center">
                      <img
                        src={result.mask_overlay_base64}
                        alt="Segmentation Overlay"
                        className={`max-h-full object-contain transition-opacity duration-300 ${
                          showMask ? "opacity-100" : "opacity-30"
                        }`}
                      />
                      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-emerald-300 text-[10px] font-mono py-0.5 px-2 rounded">
                        Confidence: {(result.confidence * 100).toFixed(1)}% • Inference: {result.processing_time_ms}ms
                      </div>
                    </div>
                  </div>
                )}

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Pollution Score</p>
                    <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {result.pollution_score} <span className="text-xs text-slate-400">/ 100</span>
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Density Tier</p>
                    <p className="text-xl font-black text-[#17324D] dark:text-white mt-0.5">{result.density}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Items Estimated</p>
                    <p className="text-xl font-black text-[#17324D] dark:text-white mt-0.5">
                      ~{result.estimated_items_count}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#122e47] border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Affected Area</p>
                    <p className="text-xl font-black text-[#17324D] dark:text-white mt-0.5">
                      {result.estimated_area_m2} <span className="text-xs text-slate-400">m²</span>
                    </p>
                  </div>
                </div>

                {/* Hazard Flags */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {result.entanglement_hazard && (
                    <span className="py-1 px-2.5 rounded-lg bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-xs font-bold flex items-center gap-1.5 border border-red-300 dark:border-red-800">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>CRITICAL ENTANGLEMENT HAZARD (Fauna &amp; Coral Threat)</span>
                    </span>
                  )}
                  {result.navigation_hazard && (
                    <span className="py-1 px-2.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 border border-amber-300 dark:border-amber-800">
                      <Anchor className="w-3.5 h-3.5" />
                      <span>NAVIGATION HAZARD (Vessel Propellor Warning)</span>
                    </span>
                  )}
                </div>

                {/* Escalate Button / Result State */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  {escalatedCode ? (
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Escalated to Active Marine Waste Incident: <strong>{escalatedCode}</strong></span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleEscalateIncident}
                      disabled={escalating}
                      className="py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider shadow transition flex items-center gap-2"
                    >
                      <ArrowRight className="w-4 h-4" />
                      <span>{escalating ? "Registering..." : "Escalate to Operations Command"}</span>
                    </button>
                  )}

                  <Link
                    to="/admin/waste"
                    className="text-xs font-bold text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    View All Incidents →
                  </Link>
                </div>
              </div>

              {/* Transparent 5-Factor Score Breakdown Card */}
              <div className="p-5 rounded-2xl bg-white dark:bg-[#0c1f33] border border-[#D9E8F2] dark:border-[#1a3854] shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-black text-[#17324D] dark:text-white">
                    Transparent Pollution Score Explanation (Hackathon Formula)
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 font-mono">
                  {result.score_breakdown.formula_note}
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 text-[10px] uppercase">
                        <th className="py-2">Factor Component</th>
                        <th className="py-2">Weight</th>
                        <th className="py-2">Normalized (0-100)</th>
                        <th className="py-2">Weighted Contribution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      <tr>
                        <td className="py-2 font-semibold">1. Waste Density</td>
                        <td className="py-2 font-mono text-emerald-600">35%</td>
                        <td className="py-2 font-mono">{result.score_breakdown.waste_density_score}</td>
                        <td className="py-2 font-mono font-bold">+{result.score_breakdown.density_weighted}</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold">2. Affected Area</td>
                        <td className="py-2 font-mono text-emerald-600">25%</td>
                        <td className="py-2 font-mono">{result.score_breakdown.affected_area_score}</td>
                        <td className="py-2 font-mono font-bold">+{result.score_breakdown.area_weighted}</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold">3. Distance From Coast</td>
                        <td className="py-2 font-mono text-emerald-600">15%</td>
                        <td className="py-2 font-mono">{result.score_breakdown.distance_coast_score}</td>
                        <td className="py-2 font-mono font-bold">+{result.score_breakdown.distance_weighted}</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold">4. Ecological Sensitivity</td>
                        <td className="py-2 font-mono text-emerald-600">15%</td>
                        <td className="py-2 font-mono">{result.score_breakdown.ecological_sensitivity_score}</td>
                        <td className="py-2 font-mono font-bold">+{result.score_breakdown.sensitivity_weighted}</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-semibold">5. Waste Severity / Persistence</td>
                        <td className="py-2 font-mono text-emerald-600">10%</td>
                        <td className="py-2 font-mono">{result.score_breakdown.waste_severity_score}</td>
                        <td className="py-2 font-mono font-bold">+{result.score_breakdown.severity_weighted}</td>
                      </tr>
                      <tr className="bg-emerald-50/50 dark:bg-emerald-950/20 font-black">
                        <td className="py-2.5 text-emerald-800 dark:text-emerald-300">TOTAL POLLUTION SCORE</td>
                        <td className="py-2.5">100%</td>
                        <td className="py-2.5">—</td>
                        <td className="py-2.5 text-emerald-600 text-sm">{result.pollution_score} / 100</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
