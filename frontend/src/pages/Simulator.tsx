import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import {
  Waves,
  Play,
  AlertTriangle,
  Compass,
  Wind,
  ShieldAlert,
  DollarSign,
  Fish,
  Anchor,
  MapPin,
  Clock,
  Sliders,
  CheckCircle2,
  XCircle,
  Trash2,
  Scale,
  X,
} from "lucide-react";
import apiService from "../services/api";
import { isWaterCoordinate } from "../utils/coastal";
import type {
  SimulationRunItem,
  SimulationRunListItem,
  SimulationCreatePayload,
  SimulationCompareResponse,
  OilType,
  SpillSizeUnit,
  SimulationWaypoint,
} from "../types";

// Helper for cardinal compass heading
function degreesToCardinal(deg: number): string {
  const val = Math.floor((deg / 22.5) + 0.5);
  const points = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
  ];
  return points[val % 16];
}

// Controller to smoothly center map
const MapController: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center, zoom, map]);
  return null;
};

// Map click listener for coordinate picker
const MapClickHandler: React.FC<{
  enabled: boolean;
  onPickLocation: (lat: number, lon: number) => void;
}> = ({ enabled, onPickLocation }) => {
  useMapEvents({
    click(e) {
      if (enabled) {
        onPickLocation(Number(e.latlng.lat.toFixed(4)), Number(e.latlng.lng.toFixed(4)));
      }
    },
  });
  return null;
};

// Custom DivIcons
const originIcon = L.divIcon({
  className: "custom-sim-origin",
  html: `
    <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 26px; height: 26px; border-radius: 50%; background: rgba(6, 182, 212, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 14px; height: 14px; border-radius: 50%; background: #06b6d4; border: 2.5px solid #ffffff; box-shadow: 0 0 10px #06b6d4;"></div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

const landfallIcon = L.divIcon({
  className: "custom-sim-landfall",
  html: `
    <div style="position: relative; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: rgba(239, 68, 68, 0.5); animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 16px; height: 16px; border-radius: 50%; background: #ef4444; border: 2.5px solid #ffffff; box-shadow: 0 0 12px #ef4444; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold;">!</div>
    </div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15],
});

const waypointIcon = (hour: number) => L.divIcon({
  className: "custom-sim-waypoint",
  html: `
    <div style="width: 20px; height: 20px; border-radius: 50%; background: #0e7490; border: 1.5px solid #67e8f9; display: flex; align-items: center; justify-content: center; color: #cffafe; font-size: 9px; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.6);">
      ${Math.round(hour)}h
    </div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
});

// Scenario Presets
interface ScenarioPreset {
  name: string;
  spillSize: number;
  unit: SpillSizeUnit;
  oilType: OilType;
  windSpeed: number;
  windDir: number;
  currentSpeed: number;
  currentDir: number;
  duration: number;
  lat: number;
  lon: number;
  notes: string;
}

const PRESETS: ScenarioPreset[] = [
  {
    name: "Coastal Barge Collision (500 bbl Diesel)",
    spillSize: 500,
    unit: "BARRELS",
    oilType: "DIESEL_REFINED",
    windSpeed: 22,
    windDir: 90, // East -> pushes West toward shore
    currentSpeed: 1.8,
    currentDir: 260, // West
    duration: 24,
    lat: 13.0827,
    lon: 80.3150,
    notes: "Hypothetical fuel barge grounding 3.5 nautical miles offshore Chennai port.",
  },
  {
    name: "Offshore Tanker Rupture (3,000 bbl Heavy Crude)",
    spillSize: 3000,
    unit: "BARRELS",
    oilType: "HEAVY_CRUDE",
    windSpeed: 30,
    windDir: 65,
    currentSpeed: 2.2,
    currentDir: 235,
    duration: 48,
    lat: 13.1500,
    lon: 80.4500,
    notes: "Crude carrier hull compromise along busy Bay of Bengal transit corridor.",
  },
  {
    name: "Harbor Bunker C Leak (1,200 bbl)",
    spillSize: 1200,
    unit: "BARRELS",
    oilType: "BUNKER_FUEL",
    windSpeed: 15,
    windDir: 120,
    currentSpeed: 1.2,
    currentDir: 300,
    duration: 24,
    lat: 13.2400,
    lon: 80.3500,
    notes: "High-viscosity bunker fuel discharge near Ennore port approach.",
  },
  {
    name: "Deepwater Well Blowout (10,000 bbl Light Crude)",
    spillSize: 10000,
    unit: "BARRELS",
    oilType: "LIGHT_CRUDE",
    windSpeed: 28,
    windDir: 180,
    currentSpeed: 1.5,
    currentDir: 350,
    duration: 72,
    lat: 12.9500,
    lon: 80.5000,
    notes: "Major deepwater exploration well rupture with high evaporation rate.",
  },
];

export default function Simulator() {
  // Scenario List & Active Run
  const [runs, setRuns] = useState<SimulationRunListItem[]>([]);
  const [activeRun, setActiveRun] = useState<SimulationRunItem | null>(null);
  const [loadingRuns, setLoadingRuns] = useState<boolean>(false);
  const [runningSim, setRunningSim] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [scenarioName, setScenarioName] = useState<string>("Hypothetical Spill Scenario");
  const [scenarioNotes, setScenarioNotes] = useState<string>("");
  const [lat, setLat] = useState<number>(13.1500);
  const [lon, setLon] = useState<number>(80.4500);
  const [pickOnMap, setPickOnMap] = useState<boolean>(false);

  const [spillSize, setSpillSize] = useState<number>(500);
  const [spillUnit, setSpillUnit] = useState<SpillSizeUnit>("BARRELS");
  const [oilType, setOilType] = useState<OilType>("LIGHT_CRUDE");

  const [windSpeed, setWindSpeed] = useState<number>(25);
  const [windDir, setWindDir] = useState<number>(225);
  const [currentSpeed, setCurrentSpeed] = useState<number>(2.0);
  const [currentDir, setCurrentDir] = useState<number>(45);
  const [duration, setDuration] = useState<number>(24);

  // UI Tabs & Comparison Mode
  const [activeTab, setActiveTab] = useState<"movement" | "risk" | "ecosystem" | "coastal" | "economic" | "response">("movement");
  const [showCompareModal, setShowCompareModal] = useState<boolean>(false);
  const [compareId1, setCompareId1] = useState<string>("");
  const [compareId2, setCompareId2] = useState<string>("");
  const [compareData, setCompareData] = useState<SimulationCompareResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState<boolean>(false);

  // Fetch runs list
  const fetchRuns = useCallback(async () => {
    try {
      setLoadingRuns(true);
      const list = await apiService.getSimulations({ limit: 50 });
      setRuns(list || []);
      if (list && list.length > 0 && !activeRun) {
        // Load latest run details
        const latest = await apiService.getSimulationById(list[0].id);
        setActiveRun(latest);
      }
    } catch (err: any) {
      console.error("Failed to load simulations:", err);
    } finally {
      setLoadingRuns(false);
    }
  }, [activeRun]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Apply Preset
  const handleApplyPreset = (preset: ScenarioPreset) => {
    setScenarioName(preset.name);
    setSpillSize(preset.spillSize);
    setSpillUnit(preset.unit);
    setOilType(preset.oilType);
    setWindSpeed(preset.windSpeed);
    setWindDir(preset.windDir);
    setCurrentSpeed(preset.currentSpeed);
    setCurrentDir(preset.currentDir);
    setDuration(preset.duration);
    setLat(preset.lat);
    setLon(preset.lon);
    setScenarioNotes(preset.notes);
    setErrorMessage(null);
  };

  // Run Simulation Submission
  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate that hypothetical spill origin is strictly in ocean/sea water
    if (!isWaterCoordinate(Number(lat), Number(lon))) {
      setErrorMessage("Please select a location in the sea.");
      return;
    }

    setRunningSim(true);

    try {
      const payload: SimulationCreatePayload = {
        name: scenarioName.trim() || undefined,
        notes: scenarioNotes.trim() || undefined,
        inputs: {
          latitude: Number(lat),
          longitude: Number(lon),
          spill_size: Number(spillSize),
          spill_size_unit: spillUnit,
          oil_type: oilType,
          wind_speed_kmh: Number(windSpeed),
          wind_direction_deg: Number(windDir),
          current_speed_knots: Number(currentSpeed),
          current_direction_deg: Number(currentDir),
          duration_hours: Number(duration),
        },
        auto_run: true,
      };

      const result = await apiService.createSimulation(payload);
      setActiveRun(result);
      // Refresh list
      const updatedList = await apiService.getSimulations({ limit: 50 });
      setRuns(updatedList || []);
      // Switch to movement tab to show results
      setActiveTab("movement");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to execute simulation scenario.");
    } finally {
      setRunningSim(false);
      setPickOnMap(false);
    }
  };

  // Load a historical simulation
  const handleSelectRun = async (id: string) => {
    try {
      setRunningSim(true);
      const data = await apiService.getSimulationById(id);
      setActiveRun(data);
      if (data.inputs) {
        setLat(data.inputs.latitude);
        setLon(data.inputs.longitude);
        setSpillSize(data.inputs.spill_size);
        setSpillUnit(data.inputs.spill_size_unit);
        setOilType(data.inputs.oil_type);
        setWindSpeed(data.inputs.wind_speed_kmh);
        setWindDir(data.inputs.wind_direction_deg);
        setCurrentSpeed(data.inputs.current_speed_knots);
        setCurrentDir(data.inputs.current_direction_deg);
        setDuration(data.inputs.duration_hours);
        setScenarioName(data.name);
      }
    } catch (err: any) {
      setErrorMessage("Could not load simulation scenario.");
    } finally {
      setRunningSim(false);
    }
  };

  // Delete run
  const handleDeleteRun = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this simulation scenario?")) return;
    try {
      await apiService.deleteSimulation(id);
      const updated = runs.filter((r) => r.id !== id);
      setRuns(updated);
      if (activeRun?.id === id) {
        if (updated.length > 0) {
          const next = await apiService.getSimulationById(updated[0].id);
          setActiveRun(next);
        } else {
          setActiveRun(null);
        }
      }
    } catch (err: any) {
      alert("Failed to delete simulation.");
    }
  };

  // Run Comparison
  const handleRunComparison = async () => {
    if (!compareId1 || !compareId2 || compareId1 === compareId2) {
      alert("Please select two distinct simulation scenarios to compare.");
      return;
    }
    try {
      setCompareLoading(true);
      const res = await apiService.compareSimulations([compareId1, compareId2]);
      setCompareData(res);
    } catch (err: any) {
      alert("Failed to load scenario comparison: " + (err.message || "Unknown error"));
    } finally {
      setCompareLoading(false);
    }
  };

  // Map trajectory points & bounds
  const mapWaypoints: SimulationWaypoint[] = useMemo(() => {
    return activeRun?.outputs?.predicted_movement?.waypoints || [];
  }, [activeRun]);

  const polylinePositions: [number, number][] = useMemo(() => {
    return mapWaypoints.map((wp) => [wp.latitude, wp.longitude]);
  }, [mapWaypoints]);

  const mapCenter: [number, number] = useMemo(() => {
    if (mapWaypoints.length > 0) {
      return [mapWaypoints[0].latitude, mapWaypoints[0].longitude];
    }
    return [lat, lon];
  }, [mapWaypoints, lat, lon]);

  const landfallCoords = activeRun?.outputs?.coastal_impact?.landfall_coordinates;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── Page Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-ocean-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#EAF6FF] border border-[#D9E8F2] text-[#1268B3] shadow-sm">
              <Waves className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-[#0B3A66] font-mono">
                  WHAT-IF OIL SPILL SIMULATOR
                </h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#EAF6FF] text-[#1268B3] border border-[#D9E8F2] uppercase">
                  Module 20
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#E8F8F4] text-[#087F68] border border-[#B3E7DA] uppercase">
                  Isolated Environment
                </span>
              </div>
              <p className="text-sm text-[#5E7183] mt-1">
                Hypothetical multi-domain consequence simulation (Movement, Ecosystem, Coastal Landfall, Risk, Economic, Response).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Historical Scenarios Dropdown & Delete */}
          <div className="flex items-center gap-1.5">
            <select
              value={activeRun?.id || ""}
              onChange={(e) => e.target.value && handleSelectRun(e.target.value)}
              className="bg-white text-[#17324D] border border-[#D9E8F2] text-xs rounded-lg px-3 py-2 font-mono focus:border-[#1268B3] focus:outline-none shadow-sm"
              disabled={loadingRuns}
            >
              <option value="" disabled>Select Saved Scenario...</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.spill_size_barrels ? `${r.spill_size_barrels.toLocaleString()} bbl` : ""})
                </option>
              ))}
            </select>
            {activeRun && (
              <button
                type="button"
                onClick={(e) => handleDeleteRun(activeRun.id, e)}
                title="Delete this scenario"
                className="p-2 rounded-lg bg-white hover:bg-red-50 text-[#5E7183] hover:text-[#C6283D] border border-[#D9E8F2] hover:border-red-300 transition cursor-pointer shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => {
              setShowCompareModal(true);
              if (runs.length >= 2) {
                setCompareId1(runs[0].id);
                setCompareId2(runs[1].id);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-[#F3FAFE] text-[#1268B3] border border-[#1268B3] text-xs font-semibold font-mono transition cursor-pointer shadow-sm"
          >
            <Scale className="w-3.5 h-3.5 text-[#1268B3]" />
            Compare Scenarios
          </button>
        </div>
      </div>

      {/* ── Mandatory Decision-Support Disclaimer Banner ── */}
      <div className="bg-[#FFF9EB] border border-[#F6D88E] rounded-xl p-3.5 flex items-start gap-3 text-[#8C5800] text-xs shadow-sm">
        <AlertTriangle className="w-4 h-4 text-[#A86A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold tracking-wide uppercase font-mono mr-1">
            Probabilistic Scenario Model — Decision Support Only:
          </span>
          All simulation predictions are theoretical mathematical estimations and do NOT modify production incidents. Results are subject to real-time atmospheric variations.
        </div>
      </div>

      {errorMessage && (
        <div className="bg-[#FFF1F2] border border-[#F5B5BC] rounded-xl p-3 flex items-center justify-between text-[#C6283D] text-xs">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-[#C6283D] shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-[#C6283D] hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Main Workspace: 2-Column Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── LEFT COLUMN: Scenario Builder Form ── */}
        <div className="lg:col-span-4 bg-white p-5 rounded-xl border border-[#D9E8F2] shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-[#D9E8F2] pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#1268B3]" />
              <h2 className="text-sm font-bold text-[#0B3A66] font-mono uppercase tracking-wide">
                Scenario Builder
              </h2>
            </div>
            <span className="text-[10px] font-mono text-[#5E7183]">Step 1 of 2</span>
          </div>

          {/* Quick Presets */}
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-[#5E7183] block mb-2 font-semibold">
              Quick Preset Scenarios
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className="text-left p-2 rounded-lg bg-[#F8FBFE] hover:bg-[#EAF6FF] border border-[#D9E8F2] hover:border-[#1268B3] transition group cursor-pointer"
                >
                  <div className="text-[11px] font-bold text-[#17324D] truncate group-hover:text-[#1268B3]">
                    {p.name.split("(")[0]}
                  </div>
                  <div className="text-[10px] text-[#5E7183] font-mono">
                    {p.spillSize} {p.unit} • {p.oilType.split("_")[0]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleRunSimulation} className="space-y-4">
            {/* Scenario Title */}
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-[#17324D] block mb-1 font-semibold">
                Scenario Name
              </label>
              <input
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                required
                className="w-full bg-white border border-[#D9E8F2] rounded-lg px-3 py-2 text-xs text-[#17324D] font-sans focus:outline-none focus:border-[#1268B3] shadow-sm"
                placeholder="e.g. Tanker Collision Scenario A"
              />
            </div>

            {/* Geographic Coordinates */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#17324D] font-semibold">
                  Hypothetical Spill Origin
                </label>
                <button
                  type="button"
                  onClick={() => setPickOnMap(!pickOnMap)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border transition cursor-pointer ${
                    pickOnMap
                      ? "bg-[#1268B3] text-white border-[#1268B3] font-bold"
                      : "bg-white text-[#1268B3] border border-[#1268B3] hover:bg-[#F3FAFE]"
                  }`}
                >
                  {pickOnMap ? "Click on map active" : "Select on map"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-[#5E7183] font-mono block">Latitude</span>
                  <input
                    type="number"
                    step="0.0001"
                    min="-90"
                    max="90"
                    value={lat}
                    onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full bg-white border border-[#D9E8F2] rounded-lg px-2.5 py-1.5 text-xs text-[#17324D] font-mono focus:outline-none focus:border-[#1268B3] shadow-sm"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#5E7183] font-mono block">Longitude</span>
                  <input
                    type="number"
                    step="0.0001"
                    min="-180"
                    max="180"
                    value={lon}
                    onChange={(e) => setLon(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full bg-white border border-[#D9E8F2] rounded-lg px-2.5 py-1.5 text-xs text-[#17324D] font-mono focus:outline-none focus:border-[#1268B3] shadow-sm"
                  />
                </div>
              </div>
              {!isWaterCoordinate(lat, lon) && (
                <div className="mt-1.5 text-[10px] text-[#C6283D] font-mono flex items-center gap-1 bg-red-50 px-2 py-1 rounded border border-red-200">
                  <AlertTriangle className="w-3 h-3 text-[#C6283D] shrink-0" />
                  <span>Please select a location in the sea.</span>
                </div>
              )}
            </div>

            {/* Spill Magnitude & Unit */}
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-7">
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#17324D] block mb-1 font-semibold">
                  Spill Size
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={spillSize}
                  onChange={(e) => setSpillSize(parseFloat(e.target.value) || 1)}
                  required
                  className="w-full bg-white border border-[#D9E8F2] rounded-lg px-3 py-2 text-xs text-[#17324D] font-mono focus:outline-none focus:border-[#1268B3] shadow-sm"
                />
              </div>
              <div className="col-span-5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#17324D] block mb-1 font-semibold">
                  Unit
                </label>
                <select
                  value={spillUnit}
                  onChange={(e) => setSpillUnit(e.target.value as SpillSizeUnit)}
                  className="w-full bg-white border border-[#D9E8F2] rounded-lg px-2.5 py-2 text-xs text-[#17324D] font-mono focus:outline-none focus:border-[#1268B3] shadow-sm"
                >
                  <option value="BARRELS">Barrels (bbl)</option>
                  <option value="TONS">Metric Tons</option>
                  <option value="M3">Cubic Meters (m³)</option>
                </select>
              </div>
            </div>

            {/* Oil Type */}
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-[#17324D] block mb-1 font-semibold">
                Oil Type & Hydrocarbon Grade
              </label>
              <select
                value={oilType}
                onChange={(e) => setOilType(e.target.value as OilType)}
                className="w-full bg-white border border-[#D9E8F2] rounded-lg px-3 py-2 text-xs text-[#17324D] font-mono focus:outline-none focus:border-[#1268B3] shadow-sm"
              >
                <option value="LIGHT_CRUDE">Light Crude Oil (API ~38°, High Evap)</option>
                <option value="HEAVY_CRUDE">Heavy Crude Oil (API ~22°, Persistent Mousse)</option>
                <option value="DIESEL_REFINED">Marine Diesel / Refined Fuel (Rapid Sheen)</option>
                <option value="BUNKER_FUEL">Heavy Bunker C Fuel (Viscous Tar Residue)</option>
              </select>
            </div>

            {/* Atmospheric & Oceanic Conditions */}
            <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2] space-y-3">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-[#17324D]">
                <span className="flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-[#1268B3]" /> Wind Conditions
                </span>
                <span className="text-[#1268B3] font-bold">{windSpeed} km/h • {degreesToCardinal(windDir)} ({windDir}°)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-[#5E7183] font-mono block">Speed (km/h)</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={windSpeed}
                    onChange={(e) => setWindSpeed(parseFloat(e.target.value))}
                    className="w-full accent-[#1268B3]"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#5E7183] font-mono block">Direction ({windDir}°)</span>
                  <input
                    type="range"
                    min="0"
                    max="359"
                    value={windDir}
                    onChange={(e) => setWindDir(parseInt(e.target.value))}
                    className="w-full accent-[#1268B3]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono font-bold text-[#17324D] pt-1 border-t border-[#D9E8F2]">
                <span className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-[#087F68]" /> Ocean Current
                </span>
                <span className="text-[#087F68] font-bold">{currentSpeed} kts • {degreesToCardinal(currentDir)} ({currentDir}°)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-[#5E7183] font-mono block">Speed (knots)</span>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    value={currentSpeed}
                    onChange={(e) => setCurrentSpeed(parseFloat(e.target.value))}
                    className="w-full accent-[#087F68]"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#5E7183] font-mono block">Direction ({currentDir}°)</span>
                  <input
                    type="range"
                    min="0"
                    max="359"
                    value={currentDir}
                    onChange={(e) => setCurrentDir(parseInt(e.target.value))}
                    className="w-full accent-[#087F68]"
                  />
                </div>
              </div>
            </div>

            {/* Simulation Horizon */}
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-[#17324D] block mb-1 font-semibold">
                Simulation Duration Horizon
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[12, 24, 36, 48, 72].map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    onClick={() => setDuration(hrs)}
                    className={`py-1.5 text-xs font-mono font-bold rounded-lg border transition cursor-pointer ${
                      duration === hrs
                        ? "bg-[#1268B3] text-white border-[#1268B3] shadow-sm"
                        : "bg-white text-[#17324D] border border-[#D9E8F2] hover:bg-[#F8FBFE]"
                    }`}
                  >
                    {hrs}h
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Action */}
            <button
              type="submit"
              disabled={runningSim}
              className="w-full py-3 px-4 rounded-xl bg-[#1268B3] hover:bg-[#0F4C81] text-white font-bold font-mono text-sm tracking-wide shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              {runningSim ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Computing Multi-Domain Physics...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>RUN WHAT-IF SIMULATION</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* ── RIGHT COLUMN: Interactive Map & Tabbed Analytical Results ── */}
        <div className="lg:col-span-8 space-y-5">
          {/* Top Quick Summary Badges */}
          {activeRun?.outputs && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Risk Gauge */}
              <div className="bg-white p-3.5 rounded-xl border border-[#D9E8F2] shadow-sm">
                <div className="flex items-center justify-between text-[#5E7183] text-[11px] font-mono uppercase">
                  <span>Simulated Risk</span>
                  <ShieldAlert className="w-3.5 h-3.5 text-[#C6283D]" />
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className={`text-2xl font-bold font-mono ${
                    activeRun.outputs.risk.level === "CRITICAL"
                      ? "text-[#C6283D]"
                      : activeRun.outputs.risk.level === "HIGH"
                      ? "text-[#A86A00]"
                      : "text-[#1268B3]"
                  }`}>
                    {activeRun.outputs.risk.score}/100
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F8FBFE] border border-[#D9E8F2] text-[#17324D]">
                    {activeRun.outputs.risk.level}
                  </span>
                </div>
              </div>

              {/* Coastal Landfall ETA */}
              <div className="bg-white p-3.5 rounded-xl border border-[#D9E8F2] shadow-sm">
                <div className="flex items-center justify-between text-[#5E7183] text-[11px] font-mono uppercase">
                  <span>Shoreline Landfall</span>
                  <Clock className="w-3.5 h-3.5 text-[#A86A00]" />
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  {activeRun.outputs.coastal_impact.shoreline_impacted ? (
                    <>
                      <span className="text-2xl font-bold font-mono text-[#A86A00]">
                        {activeRun.outputs.coastal_impact.time_to_shore_hours?.toFixed(1)}h
                      </span>
                      <span className="text-[10px] text-[#5E7183] font-mono">until impact</span>
                    </>
                  ) : (
                    <span className="text-sm font-bold font-mono text-[#087F68]">
                      Offshore Clear ({activeRun.outputs.coastal_impact.closest_distance_to_coast_km}km)
                    </span>
                  )}
                </div>
              </div>

              {/* Financial Exposure */}
              <div className="bg-white p-3.5 rounded-xl border border-[#D9E8F2] shadow-sm">
                <div className="flex items-center justify-between text-[#5E7183] text-[11px] font-mono uppercase">
                  <span>Est. Economic Loss</span>
                  <DollarSign className="w-3.5 h-3.5 text-[#087F68]" />
                </div>
                <div className="mt-1.5">
                  <span className="text-xl font-bold font-mono text-[#087F68]">
                    ${(activeRun.outputs.economic_estimate.total_expected_usd / 1000).toFixed(0)}k
                  </span>
                  <span className="text-[10px] text-[#5E7183] font-mono block">USD exposure</span>
                </div>
              </div>

              {/* Response Tier */}
              <div className="bg-white p-3.5 rounded-xl border border-[#D9E8F2] shadow-sm">
                <div className="flex items-center justify-between text-[#5E7183] text-[11px] font-mono uppercase">
                  <span>Response Tier</span>
                  <Anchor className="w-3.5 h-3.5 text-[#1268B3]" />
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-sm font-bold font-mono text-[#0B3A66]">
                    {activeRun.outputs.recommendations.response_tier.replace(/_/g, " ")}
                  </span>
                </div>
                <span className="text-[10px] text-[#5E7183] font-mono truncate block">
                  {activeRun.outputs.recommendations.overall_strategy.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          )}

          {/* ── Leaflet Interactive Simulation Map ── */}
          <div className="bg-white rounded-xl border border-[#D9E8F2] overflow-hidden shadow-sm">
            <div className="p-3 bg-[#F8FBFE] border-b border-[#D9E8F2] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#1268B3]" />
                <span className="text-xs font-bold text-[#0B3A66] font-mono uppercase">
                  Trajectory & Spreading Projection Map
                </span>
                {pickOnMap && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FFF9EB] text-[#8C5800] border border-[#F6D88E] animate-pulse">
                    Click anywhere on map to set spill coordinates
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-[#5E7183]">
                {mapWaypoints.length} waypoints • {duration}h forecast
              </div>
            </div>

            <div className="h-[360px] w-full relative">
              <MapContainer
                center={mapCenter}
                zoom={10}
                style={{ height: "100%", width: "100%", background: "#061325" }}
              >
                {/* Basemap Tiles (100% Free, No Watermarks, No API Key Required) */}
                <TileLayer
                  attribution='&copy; <a href="https://www.esri.com/">Esri</a>, DeLorme, NAVTEQ'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={16}
                />
                <TileLayer
                  attribution=""
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={16}
                  opacity={0.8}
                />
                <MapController center={mapCenter} zoom={10} />
                <MapClickHandler
                  enabled={pickOnMap}
                  onPickLocation={(pickedLat, pickedLon) => {
                    if (!isWaterCoordinate(pickedLat, pickedLon)) {
                      setErrorMessage("Please select a location in the sea.");
                      return;
                    }
                    setErrorMessage(null);
                    setLat(pickedLat);
                    setLon(pickedLon);
                    setPickOnMap(false);
                  }}
                />

                {/* Origin Marker */}
                <Marker position={[lat, lon]} icon={originIcon}>
                  <Popup>
                    <div className="text-xs font-sans text-slate-900 p-1">
                      <strong className="block text-cyan-700 font-bold mb-1">Hypothetical Spill Origin</strong>
                      <div>Coordinates: {lat.toFixed(4)}°N, {lon.toFixed(4)}°E</div>
                      <div>Volume: {spillSize} {spillUnit} ({oilType})</div>
                    </div>
                  </Popup>
                </Marker>

                {/* Trajectory Polyline */}
                {polylinePositions.length > 1 && (
                  <Polyline
                    positions={polylinePositions}
                    pathOptions={{
                      color: "#06b6d4",
                      weight: 4,
                      dashArray: "6, 8",
                      opacity: 0.9,
                    }}
                  />
                )}

                {/* Intermediate waypoint markers (every 6h or key steps) */}
                {mapWaypoints
                  .filter((wp) => wp.hour > 0 && (wp.hour % 6 === 0 || wp.hour === duration))
                  .map((wp, idx) => (
                    <React.Fragment key={idx}>
                      <Marker position={[wp.latitude, wp.longitude]} icon={waypointIcon(wp.hour)}>
                        <Popup>
                          <div className="text-xs font-sans text-slate-900 p-1">
                            <strong className="block text-cyan-800 font-bold mb-0.5">Forecast Step: +{wp.hour} Hours</strong>
                            <div>Slick Area: <strong>{wp.slick_area_km2} km²</strong></div>
                            <div>Uncertainty Radius: <strong>{wp.uncertainty_radius_km} km</strong></div>
                            <div>Distance Drunk: {wp.distance_from_origin_km} km</div>
                          </div>
                        </Popup>
                      </Marker>
                      {/* Fay spreading uncertainty envelope */}
                      <Circle
                        center={[wp.latitude, wp.longitude]}
                        radius={wp.uncertainty_radius_km * 1000}
                        pathOptions={{
                          color: "#38bdf8",
                          fillColor: "#0284c7",
                          fillOpacity: 0.15,
                          weight: 1,
                        }}
                      />
                    </React.Fragment>
                  ))}

                {/* Shoreline Landfall marker if impacted */}
                {landfallCoords?.latitude && landfallCoords?.longitude && (
                  <Marker position={[landfallCoords.latitude, landfallCoords.longitude]} icon={landfallIcon}>
                    <Popup>
                      <div className="text-xs font-sans text-slate-900 p-1">
                        <strong className="block text-red-600 font-bold mb-0.5">Estimated Shoreline Landfall</strong>
                        <div>ETA: <strong>{activeRun?.outputs?.coastal_impact?.time_to_shore_hours?.toFixed(1)} Hours</strong></div>
                        <div>Coordinates: {landfallCoords.latitude.toFixed(4)}°N, {landfallCoords.longitude.toFixed(4)}°E</div>
                      </div>
                    </Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>
          </div>

          {/* ── Domain Results Tabs ── */}
          {activeRun?.outputs && (
            <div className="bg-white rounded-xl border border-[#D9E8F2] overflow-hidden shadow-sm">
              {/* Tab Navigation */}
              <div className="flex border-b border-[#D9E8F2] bg-[#F8FBFE] overflow-x-auto text-xs font-mono font-bold">
                {[
                  { id: "movement", label: "Movement", icon: Wind },
                  { id: "risk", label: "Risk Assessment", icon: ShieldAlert },
                  { id: "ecosystem", label: "Ecosystem Impact", icon: Fish },
                  { id: "coastal", label: "Coastal Landfall", icon: Anchor },
                  { id: "economic", label: "Economic Loss", icon: DollarSign },
                  { id: "response", label: "Response Tactics", icon: CheckCircle2 },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 px-4 py-3 border-b-2 transition cursor-pointer whitespace-nowrap ${
                        activeTab === tab.id
                          ? "border-[#1268B3] text-[#1268B3] bg-white"
                          : "border-transparent text-[#5E7183] hover:text-[#17324D] hover:bg-white/60"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Content Panels */}
              <div className="p-5">
                {/* 1. MOVEMENT TAB */}
                {activeTab === "movement" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2]">
                        <span className="text-[10px] text-[#5E7183] font-mono uppercase block">Drift Velocity</span>
                        <span className="text-base font-bold font-mono text-[#0B3A66]">
                          {activeRun.outputs.predicted_movement.drift_speed_kmh} km/h
                        </span>
                        <span className="text-[10px] text-[#5E7183] font-mono block">
                          ({activeRun.outputs.predicted_movement.drift_speed_knots} kts)
                        </span>
                      </div>
                      <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2]">
                        <span className="text-[10px] text-[#5E7183] font-mono uppercase block">Drift Heading</span>
                        <span className="text-base font-bold font-mono text-[#087F68]">
                          {activeRun.outputs.predicted_movement.drift_heading_deg}° ({degreesToCardinal(activeRun.outputs.predicted_movement.drift_heading_deg)})
                        </span>
                        <span className="text-[10px] text-[#5E7183] font-mono block">Lagrangian Vector</span>
                      </div>
                      <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2]">
                        <span className="text-[10px] text-[#5E7183] font-mono uppercase block">Fay Spreading Area</span>
                        <span className="text-base font-bold font-mono text-[#1268B3]">
                          {activeRun.outputs.predicted_movement.final_area_km2} km²
                        </span>
                        <span className="text-[10px] text-[#5E7183] font-mono block">
                          from {activeRun.outputs.predicted_movement.initial_area_km2} km²
                        </span>
                      </div>
                      <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2]">
                        <span className="text-[10px] text-[#5E7183] font-mono uppercase block">Evaporation (24h)</span>
                        <span className="text-base font-bold font-mono text-[#A86A00]">
                          ~{activeRun.outputs.predicted_movement.evaporated_percentage.toFixed(0)}%
                        </span>
                        <span className="text-[10px] text-[#5E7183] font-mono block">Natural weather decay</span>
                      </div>
                    </div>

                    {/* Hourly Waypoints Table */}
                    <div className="overflow-x-auto max-h-60 overflow-y-auto border border-[#D9E8F2] rounded-lg">
                      <table className="w-full text-left text-xs text-[#17324D] font-mono">
                        <thead className="bg-[#F4F9FD] text-[#5E7183] uppercase text-[10px] sticky top-0 border-b border-[#D9E8F2]">
                          <tr>
                            <th className="p-2.5">Horizon</th>
                            <th className="p-2.5">Latitude</th>
                            <th className="p-2.5">Longitude</th>
                            <th className="p-2.5">Slick Area</th>
                            <th className="p-2.5">Uncertainty Radius</th>
                            <th className="p-2.5">Distance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D9E8F2] bg-white">
                          {mapWaypoints.map((wp) => (
                            <tr key={wp.step} className="hover:bg-[#F3FAFE]">
                              <td className="p-2 text-[#1268B3] font-bold">+{wp.hour}h</td>
                              <td className="p-2">{wp.latitude.toFixed(4)}°N</td>
                              <td className="p-2">{wp.longitude.toFixed(4)}°E</td>
                              <td className="p-2 text-[#087F68] font-semibold">{wp.slick_area_km2} km²</td>
                              <td className="p-2 text-[#5E7183]">±{wp.uncertainty_radius_km} km</td>
                              <td className="p-2">{wp.distance_from_origin_km} km</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 2. RISK TAB */}
                {activeTab === "risk" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-[#F8FBFE] rounded-xl border border-[#D9E8F2]">
                      <div>
                        <div className="text-xs font-mono uppercase text-[#5E7183]">Calculated Multi-Factor Risk Score</div>
                        <div className="text-3xl font-bold font-mono text-[#0B3A66] mt-1">
                          {activeRun.outputs.risk.score} <span className="text-sm font-normal text-[#5E7183]">/ 100</span>
                        </div>
                      </div>
                      <span className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono uppercase border ${
                        activeRun.outputs.risk.level === "CRITICAL"
                          ? "bg-[#FFF1F2] text-[#C6283D] border-[#F5B5BC]"
                          : activeRun.outputs.risk.level === "HIGH"
                          ? "bg-[#FFF9EB] text-[#A86A00] border-[#F6D88E]"
                          : "bg-[#EAF6FF] text-[#1268B3] border-[#D9E8F2]"
                      }`}>
                        {activeRun.outputs.risk.level} SEVERITY
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      <div className="text-xs font-mono font-bold text-[#17324D] uppercase">Risk Factor Breakdown</div>
                      {[
                        { label: "Spill Volume & Mass Factor", score: activeRun.outputs.risk.factors.spill_volume_score, max: 25 },
                        { label: "Coastal Proximity & Shoreline Landfall", score: activeRun.outputs.risk.factors.coastal_proximity_score, max: 25 },
                        { label: "Ecosystem Sensitivity & Biome Exposure", score: activeRun.outputs.risk.factors.ecosystem_sensitivity_score, max: 20 },
                        { label: "Hydrocarbon Persistence & Toxicity", score: activeRun.outputs.risk.factors.persistence_hazard_score, max: 15 },
                        { label: "Spreading & Uncertainty Envelope", score: activeRun.outputs.risk.factors.spread_expansion_score, max: 15 },
                      ].map((item, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-[#5E7183]">{item.label}</span>
                            <span className="text-[#1268B3] font-bold">{item.score} / {item.max} pts</span>
                          </div>
                          <div className="w-full h-2 bg-[#EAF3F8] rounded-full overflow-hidden border border-[#D9E8F2]">
                            <div
                              className="h-full bg-[#1268B3] rounded-full"
                              style={{ width: `${(item.score / item.max) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2] text-xs text-[#17324D]">
                      <strong>Analysis Summary:</strong> {activeRun.outputs.risk.explanation}
                    </div>
                  </div>
                )}

                {/* 3. ECOSYSTEM TAB */}
                {activeTab === "ecosystem" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3.5 bg-[#F8FBFE] rounded-xl border border-[#D9E8F2]">
                      <div>
                        <div className="text-xs font-mono uppercase text-[#5E7183]">Ecosystem Vulnerability Index</div>
                        <div className="text-2xl font-bold font-mono text-[#1268B3] mt-0.5">
                          {activeRun.outputs.ecosystem_impact.vulnerability_score}/100
                        </div>
                      </div>
                      <div className="text-xs font-mono text-[#5E7183] text-right">
                        <div>{activeRun.outputs.ecosystem_impact.vulnerable_biomes_count} biomes within decay radius</div>
                      </div>
                    </div>

                    <p className="text-xs text-[#17324D]">
                      {activeRun.outputs.ecosystem_impact.ecological_summary}
                    </p>

                    <div className="space-y-2">
                      <div className="text-xs font-mono font-bold text-[#17324D] uppercase">Identified Marine Biomes at Risk</div>
                      <div className="divide-y divide-[#D9E8F2] border border-[#D9E8F2] rounded-lg overflow-hidden bg-white">
                        {activeRun.outputs.ecosystem_impact.zones.map((z, idx) => (
                          <div key={idx} className="p-3 bg-white hover:bg-[#F8FBFE] flex items-center justify-between text-xs">
                            <div>
                              <div className="font-bold text-[#17324D]">{z.name}</div>
                              <div className="text-[11px] text-[#5E7183] font-mono">
                                Category: {z.type.replace(/_/g, " ")} • Proximity: {z.distance_km} km
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                              z.vulnerability_tier === "CRITICAL"
                                ? "bg-[#FFF1F2] text-[#C6283D] border-[#F5B5BC]"
                                : z.vulnerability_tier === "HIGH"
                                ? "bg-[#FFF9EB] text-[#A86A00] border-[#F6D88E]"
                                : "bg-[#EAF6FF] text-[#1268B3] border-[#D9E8F2]"
                            }`}>
                              {z.vulnerability_tier}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. COASTAL IMPACT TAB */}
                {activeTab === "coastal" && (
                  <div className="space-y-4">
                    <div className="p-4 bg-[#F8FBFE] rounded-xl border border-[#D9E8F2]">
                      <div className="flex items-center gap-2 mb-2">
                        <Anchor className="w-4 h-4 text-[#1268B3]" />
                        <h3 className="text-sm font-bold font-mono text-[#0B3A66] uppercase">Shoreline Landfall Assessment</h3>
                      </div>
                      <p className="text-xs text-[#17324D]">
                        {activeRun.outputs.coastal_impact.shoreline_threat_summary}
                      </p>
                      {landfallCoords && (
                        <div className="mt-3 p-2.5 bg-white rounded-lg border border-[#D9E8F2] text-xs font-mono text-[#0B3A66] flex items-center justify-between">
                          <span>Earliest Landfall Point:</span>
                          <strong>{landfallCoords.latitude.toFixed(4)}°N, {landfallCoords.longitude.toFixed(4)}°E</strong>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-mono font-bold text-[#17324D] uppercase">Threatened Coastal Assets & Ports</div>
                      {activeRun.outputs.coastal_impact.threatened_assets.length > 0 ? (
                        <div className="divide-y divide-[#D9E8F2] border border-[#D9E8F2] rounded-lg overflow-hidden bg-white">
                          {activeRun.outputs.coastal_impact.threatened_assets.map((asset, idx) => (
                            <div key={idx} className="p-3 bg-white hover:bg-[#F8FBFE] flex items-center justify-between text-xs">
                              <div>
                                <div className="font-bold text-[#17324D]">{asset.name}</div>
                                <div className="text-[11px] text-[#5E7183] font-mono">
                                  {asset.risk_notes}
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-[#FFF9EB] text-[#A86A00] border border-[#F6D88E]">
                                {asset.sensitivity}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2] text-xs text-[#5E7183]">
                          No major commercial ports or populated recreational shorelines within immediate landfall path.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 5. ECONOMIC TAB */}
                {activeTab === "economic" && (
                  <div className="space-y-4">
                    <div className="p-4 bg-[#F8FBFE] rounded-xl border border-[#D9E8F2]">
                      <div className="text-xs font-mono uppercase text-[#5E7183]">Total Projected Financial Exposure</div>
                      <div className="text-3xl font-bold font-mono text-[#087F68] mt-1">
                        ${activeRun.outputs.economic_estimate.total_expected_usd.toLocaleString()} <span className="text-xs font-sans text-[#5E7183] font-normal">USD</span>
                      </div>
                      <div className="text-xs font-mono text-[#5E7183] mt-1">
                        Confidence Range: ${activeRun.outputs.economic_estimate.low_estimate_usd.toLocaleString()} — ${activeRun.outputs.economic_estimate.high_estimate_usd.toLocaleString()} USD
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2]">
                        <div className="text-[10px] text-[#5E7183] font-mono uppercase">Commercial Fisheries Loss</div>
                        <div className="text-base font-bold font-mono text-[#0B3A66] mt-1">
                          ${activeRun.outputs.economic_estimate.pillars.commercial_fisheries_usd.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2]">
                        <div className="text-[10px] text-[#5E7183] font-mono uppercase">Port & Shipping Delays</div>
                        <div className="text-base font-bold font-mono text-[#0B3A66] mt-1">
                          ${activeRun.outputs.economic_estimate.pillars.port_shipping_delays_usd.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2]">
                        <div className="text-[10px] text-[#5E7183] font-mono uppercase">Shoreline Remediation</div>
                        <div className="text-base font-bold font-mono text-[#0B3A66] mt-1">
                          ${activeRun.outputs.economic_estimate.pillars.shoreline_cleanup_remediation_usd.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2]">
                        <div className="text-[10px] text-[#5E7183] font-mono uppercase">Containment Operations Opex</div>
                        <div className="text-base font-bold font-mono text-[#0B3A66] mt-1">
                          ${activeRun.outputs.economic_estimate.pillars.containment_operational_opex_usd.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2] text-xs text-[#17324D]">
                      <strong>Economic Notes:</strong> {activeRun.outputs.economic_estimate.economic_notes}
                    </div>
                  </div>
                )}

                {/* 6. RESPONSE TAB */}
                {activeTab === "response" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2]">
                        <span className="text-[10px] text-[#5E7183] font-mono uppercase block">Containment Booming</span>
                        <span className="text-base font-bold font-mono text-[#0B3A66]">
                          {activeRun.outputs.recommendations.containment_boom_meters.toLocaleString()} m
                        </span>
                        <span className="text-[10px] text-[#5E7183] font-mono block">Curtain/fence booms</span>
                      </div>
                      <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2]">
                        <span className="text-[10px] text-[#5E7183] font-mono uppercase block">Skimmer Capacity</span>
                        <span className="text-base font-bold font-mono text-[#087F68]">
                          {activeRun.outputs.recommendations.daily_skimmer_capacity_m3.toFixed(1)} m³/day
                        </span>
                        <span className="text-[10px] text-[#5E7183] font-mono block">Mechanical recovery</span>
                      </div>
                      <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2]">
                        <span className="text-[10px] text-[#5E7183] font-mono uppercase block">Dispersant Viability</span>
                        <span className={`text-base font-bold font-mono ${
                          activeRun.outputs.recommendations.dispersant_suitable ? "text-[#087F68]" : "text-[#A86A00]"
                        }`}>
                          {activeRun.outputs.recommendations.dispersant_suitable ? "SUITABLE" : "RESTRICTED"}
                        </span>
                        <span className="text-[10px] text-[#5E7183] font-mono block">Benthic safeguards</span>
                      </div>
                    </div>

                    <div className="p-3 bg-[#F8FBFE] rounded-lg border border-[#D9E8F2] text-xs text-[#17324D]">
                      <strong>Dispersant Rule:</strong> {activeRun.outputs.recommendations.dispersant_guidance}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-mono font-bold text-[#17324D] uppercase">Recommended Response Checklist</div>
                      <div className="space-y-2">
                        {activeRun.outputs.recommendations.tactical_actions.map((act) => (
                          <div key={act.priority} className="p-3 bg-white rounded-lg border border-[#D9E8F2] flex items-start gap-3 shadow-xs">
                            <span className="w-5 h-5 rounded-full bg-[#EAF6FF] border border-[#D9E8F2] text-[#1268B3] font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                              {act.priority}
                            </span>
                            <div className="text-xs">
                              <div className="font-bold text-[#17324D]">{act.title}</div>
                              <div className="text-[#5E7183] mt-0.5">{act.detail}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Scenario Comparison Modal ── */}
      {showCompareModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#D9E8F2] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-[#F8FBFE] border-b border-[#D9E8F2] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-[#1268B3]" />
                <h2 className="text-base font-bold font-mono text-[#0B3A66]">
                  Hypothetical Scenario Comparison
                </h2>
              </div>
              <button
                onClick={() => setShowCompareModal(false)}
                className="p-1 rounded-lg text-[#5E7183] hover:text-[#17324D] hover:bg-[#F3FAFE] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              {/* Scenario Pickers */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-mono uppercase text-[#5E7183] block mb-1 font-semibold">Scenario A</label>
                  <select
                    value={compareId1}
                    onChange={(e) => setCompareId1(e.target.value)}
                    className="w-full bg-white border border-[#D9E8F2] rounded-lg p-2 text-xs font-mono text-[#17324D] focus:outline-none focus:border-[#1268B3] shadow-sm"
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono uppercase text-[#5E7183] block mb-1 font-semibold">Scenario B</label>
                  <select
                    value={compareId2}
                    onChange={(e) => setCompareId2(e.target.value)}
                    className="w-full bg-white border border-[#D9E8F2] rounded-lg p-2 text-xs font-mono text-[#17324D] focus:outline-none focus:border-[#1268B3] shadow-sm"
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-center">
                <button
                  onClick={handleRunComparison}
                  disabled={compareLoading}
                  className="px-5 py-2 rounded-lg bg-[#1268B3] hover:bg-[#0F4C81] text-white font-mono text-xs font-bold transition cursor-pointer shadow-sm"
                >
                  {compareLoading ? "Analyzing..." : "Compare Scenarios"}
                </button>
              </div>

              {/* Comparative Results Table */}
              {compareData && (
                <div className="space-y-4">
                  <div className="overflow-x-auto border border-[#D9E8F2] rounded-xl shadow-xs">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-[#F4F9FD] text-[#5E7183] uppercase text-[10px] border-b border-[#D9E8F2]">
                        <tr>
                          <th className="p-3">Metric</th>
                          {compareData.scenarios.map((s) => (
                            <th key={s.id} className="p-3 text-[#1268B3] font-bold">{s.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D9E8F2] text-[#17324D] bg-white">
                        <tr>
                          <td className="p-3 font-bold text-[#5E7183]">Oil Type</td>
                          {compareData.scenarios.map((s) => (
                            <td key={s.id} className="p-3">{s.oil_type.replace(/_/g, " ")}</td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-3 font-bold text-[#5E7183]">Spill Volume</td>
                          {compareData.scenarios.map((s) => (
                            <td key={s.id} className="p-3 font-semibold">{s.spill_size_barrels.toLocaleString()} bbl</td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-3 font-bold text-[#5E7183]">Risk Score</td>
                          {compareData.scenarios.map((s) => (
                            <td key={s.id} className="p-3 font-bold text-[#0B3A66]">{s.risk_score}/100 ({s.risk_level})</td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-3 font-bold text-[#5E7183]">Shoreline Landfall</td>
                          {compareData.scenarios.map((s) => (
                            <td key={s.id} className="p-3">
                              {s.shoreline_impacted ? `${s.time_to_shore_hours?.toFixed(1)}h` : "No Landfall"}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-3 font-bold text-[#5E7183]">Ecosystem Vulnerability</td>
                          {compareData.scenarios.map((s) => (
                            <td key={s.id} className="p-3 font-semibold">{s.ecosystem_vulnerability_score}/100</td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-3 font-bold text-[#5E7183]">Est. Total Economic Loss</td>
                          {compareData.scenarios.map((s) => (
                            <td key={s.id} className="p-3 font-bold text-[#087F68]">${s.total_economic_usd.toLocaleString()} USD</td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-3 font-bold text-[#5E7183]">Response Tier</td>
                          {compareData.scenarios.map((s) => (
                            <td key={s.id} className="p-3">{s.response_tier.replace(/_/g, " ")}</td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-3 font-bold text-[#5E7183]">Boom Requirement</td>
                          {compareData.scenarios.map((s) => (
                            <td key={s.id} className="p-3 font-semibold">{s.containment_boom_meters.toLocaleString()} m</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {compareData.delta_summary && (
                    <div className="p-3.5 bg-[#F8FBFE] rounded-xl border border-[#D9E8F2] text-xs font-mono text-[#17324D] space-y-1">
                      <div className="font-bold text-[#1268B3] uppercase">Delta Comparison Analysis:</div>
                      <div>• Risk Score Difference: <strong>{compareData.delta_summary.risk_score_diff > 0 ? `+${compareData.delta_summary.risk_score_diff}` : compareData.delta_summary.risk_score_diff} pts</strong></div>
                      <div>• Economic Loss Variance: <strong>${Math.abs(compareData.delta_summary.economic_usd_diff || 0).toLocaleString()} USD</strong></div>
                      <div>• Spill Volume Ratio: <strong>{compareData.delta_summary.spill_volume_ratio}x</strong></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
