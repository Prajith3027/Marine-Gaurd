import React, { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  Polyline,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { Link } from "react-router-dom";
import { Flame, ExternalLink, Anchor, Navigation, Wind } from "lucide-react";
import type {
  MapIncidentPoint,
  GISLayerFeature,
  IncidentSeverity,
  NearbyZonesResponse,
  ActiveVesselPoint,
  SuspectVessel,
  MovementPredictionResponse,
  EcosystemRiskResponse,
  CoastalImpactResponse,
  OptimizedRouteResponse,
  NavigationalWaypoint,
  SourceAnalysisResponse,
} from "../../types";
import type { LayerVisibility } from "./MapLayerControls";
import type { WasteGISLayers } from "../../services/wasteApi";

interface MapCanvasProps {
  wasteLayers?: WasteGISLayers | null;
  incidents: MapIncidentPoint[];
  protectedAreas: GISLayerFeature[];
  fishingZones: GISLayerFeature[];
  ports: GISLayerFeature[];
  shippingLanes: GISLayerFeature[];
  vessels?: ActiveVesselPoint[];
  suspectVessels?: SuspectVessel[];
  highlightedVesselId?: string | null;
  onSelectVessel?: (vesselId: string) => void;
  movementPrediction?: MovementPredictionResponse | null;
  ecosystemRisk?: EcosystemRiskResponse | null;
  coastalImpact?: CoastalImpactResponse | null;
  optimizedRoute?: OptimizedRouteResponse | null;
  sourceAnalysis?: SourceAnalysisResponse | null;
  coastline?: number[][];
  visibility: LayerVisibility;
  selectedIncident: MapIncidentPoint | null;
  onSelectIncident: (incident: MapIncidentPoint) => void;
  radiusKm: number;
  nearbyData: NearbyZonesResponse | null;
  mapCenter: [number, number];
  mapZoom: number;
  basemap?: "dark" | "satellite" | "osm";
}

// Controller to smoothly pan/zoom map when target coordinates change
const MapController: React.FC<{
  center: [number, number];
  zoom: number;
}> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.4, easeLinearity: 0.25 });
  }, [center, zoom, map]);
  return null;
};

// Custom Marker Icons
const createIncidentIcon = (severity: IncidentSeverity, isSelected: boolean) => {
  let bg = "#06b6d4";
  let pulseColor = "rgba(6, 182, 212, 0.5)";
  if (severity === "CRITICAL") {
    bg = "#ef4444";
    pulseColor = "rgba(239, 68, 68, 0.6)";
  } else if (severity === "HIGH") {
    bg = "#f97316";
    pulseColor = "rgba(249, 115, 22, 0.6)";
  } else if (severity === "MODERATE") {
    bg = "#f59e0b";
    pulseColor = "rgba(245, 158, 11, 0.5)";
  }

  const pulseHtml =
    severity === "CRITICAL" || severity === "HIGH" || isSelected
      ? `<div class="custom-radar-pulse" style="background-color: ${pulseColor};"></div>`
      : "";

  const selectedBorder = isSelected
    ? `border: 2.5px solid #ffffff; box-shadow: 0 0 0 3px ${bg}, 0 0 16px ${bg}; transform: scale(1.3);`
    : `border: 2px solid #ffffff; box-shadow: 0 0 8px ${bg};`;

  return L.divIcon({
    className: "custom-incident-pin",
    html: `
      <div style="position: relative; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
        ${pulseHtml}
        <div style="width: 14px; height: 14px; border-radius: 50%; background-color: ${bg}; ${selectedBorder} transition: all 0.2s;"></div>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
};

const portIcon = L.divIcon({
  className: "custom-port-pin",
  html: `
    <div style="width: 22px; height: 22px; border-radius: 50%; background: #082f49; border: 1.5px solid #38bdf8; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.7); font-size: 11px; cursor: pointer;">
      ⚓
    </div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
});

const createVesselIcon = (vessel: ActiveVesselPoint, isSuspect: boolean, isHighlighted: boolean) => {
  const bg = isSuspect ? "#ef4444" : "#0284c7";
  const border = isSuspect ? "#fca5a5" : "#38bdf8";
  const rotate = vessel.heading_deg || 0;

  const pulseHtml = isSuspect
    ? `<div class="custom-radar-pulse" style="background-color: rgba(239, 68, 68, 0.7); width: 34px; height: 34px;"></div>`
    : "";

  const scale = isHighlighted ? "transform: scale(1.35);" : "";

  return L.divIcon({
    className: "custom-vessel-pin",
    html: `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; ${scale} transition: transform 0.2s;">
        ${pulseHtml}
        <div style="
          transform: rotate(${rotate}deg);
          width: 20px;
          height: 20px;
          background: ${bg};
          border: 1.5px solid ${isHighlighted ? '#ffffff' : border};
          border-radius: 4px 10px 4px 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 ${isSuspect ? '12px #ef4444' : '6px #0284c7'};
        ">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L19 21L12 17L5 21L12 2Z"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

export const MapCanvas: React.FC<MapCanvasProps> = ({
  wasteLayers,
  incidents,
  protectedAreas,
  fishingZones,
  ports,
  shippingLanes,
  vessels = [],
  suspectVessels = [],
  highlightedVesselId,
  onSelectVessel,
  movementPrediction,
  ecosystemRisk,
  coastalImpact,
  optimizedRoute,
  sourceAnalysis,
  coastline,
  visibility,
  selectedIncident,
  onSelectIncident,
  radiusKm,
  mapCenter,
  mapZoom,
  basemap = "dark",
}) => {
  const suspectMmsiMap = useMemo(() => {
    const map = new Map<string, SuspectVessel>();
    suspectVessels.forEach((s) => map.set(s.mmsi, s));
    return map;
  }, [suspectVessels]);
  // Convert coastline to LatLng coordinates for Leaflet Polyline
  const coastlineLatLngs = useMemo(() => {
    if (!coastline) return [];
    return coastline.map(([lng, lat]) => [lat, lng] as [number, number]);
  }, [coastline]);

  // Parse spill polygons
  const parsedPolygons = useMemo(() => {
    return incidents
      .filter((inc) => inc.spill_geometry_geojson)
      .map((inc) => {
        try {
          const geojson = JSON.parse(inc.spill_geometry_geojson!);
          return { incident: inc, geojson };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as { incident: MapIncidentPoint; geojson: any }[];
  }, [incidents]);

  // Parse protected areas polygons
  const parsedProtectedAreas = useMemo(() => {
    return protectedAreas
      .filter((p) => p.geometry_geojson)
      .map((p) => {
        try {
          return { feature: p, geojson: JSON.parse(p.geometry_geojson!) };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as { feature: GISLayerFeature; geojson: any }[];
  }, [protectedAreas]);

  // Parse fishing zones polygons
  const parsedFishingZones = useMemo(() => {
    return fishingZones
      .filter((f) => f.geometry_geojson)
      .map((f) => {
        try {
          return { feature: f, geojson: JSON.parse(f.geometry_geojson!) };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as { feature: GISLayerFeature; geojson: any }[];
  }, [fishingZones]);

  // Parse shipping lanes lines
  const parsedShippingLanes = useMemo(() => {
    return shippingLanes
      .filter((s) => s.geometry_geojson)
      .map((s) => {
        try {
          return { feature: s, geojson: JSON.parse(s.geometry_geojson!) };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as { feature: GISLayerFeature; geojson: any }[];
  }, [shippingLanes]);

  const getSpillColor = (sev: IncidentSeverity) => {
    switch (sev) {
      case "CRITICAL":
        return "#ef4444";
      case "HIGH":
        return "#f97316";
      case "MODERATE":
        return "#f59e0b";
      default:
        return "#06b6d4";
    }
  };

  // ── Movement prediction trajectory points ────────────────
  const movementTrajectory = useMemo(() => {
    if (!movementPrediction) return [];
    const pts: [number, number][] = [
      [movementPrediction.origin_latitude, movementPrediction.origin_longitude],
    ];
    movementPrediction.forecast_points.forEach((fp) => {
      pts.push([fp.latitude, fp.longitude]);
    });
    return pts;
  }, [movementPrediction]);

  return (
    <MapContainer
      center={mapCenter}
      zoom={mapZoom}
      zoomControl={true}
      className="w-full h-full relative"
      style={{ background: "#020b17" }}
    >
      <MapController center={mapCenter} zoom={mapZoom} />

      {/* Basemap Tiles (100% Free, No Watermarks, No API Key Required) */}
      {basemap === "satellite" ? (
        <>
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={18}
          />
          <TileLayer
            attribution=""
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxZoom={18}
            opacity={0.7}
          />
        </>
      ) : basemap === "osm" ? (
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
      ) : (
        <>
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
        </>
      )}

      {/* ── Layer: Coastline Reference Polyline ────────────────── */}
      {visibility.coastline && coastlineLatLngs.length > 0 && (
        <Polyline
          positions={coastlineLatLngs}
          pathOptions={{
            color: "#38bdf8",
            weight: 2,
            opacity: 0.6,
            dashArray: "6, 4",
          }}
        />
      )}

      {/* ── Layer: Protected Marine Areas (Polygons) ───────────── */}
      {visibility.protectedAreas &&
        parsedProtectedAreas.map(({ feature, geojson }) => (
          <GeoJSON
            key={feature.id}
            data={geojson}
            style={{
              color: "#10b981",
              weight: 1.5,
              dashArray: "4, 4",
              fillColor: "#10b981",
              fillOpacity: 0.18,
            }}
            onEachFeature={(_, layer) => {
              layer.bindTooltip(
                `<div class="text-xs font-semibold text-emerald-300">🛡️ ${feature.name} (${feature.sensitivity} Sensitivity)</div>`,
                { sticky: true, className: "glass-card border border-emerald-500/40 p-1" }
              );
            }}
          />
        ))}

      {/* ── Layer: Fishing Zones (Polygons) ────────────────────── */}
      {visibility.fishingZones &&
        parsedFishingZones.map(({ feature, geojson }) => (
          <GeoJSON
            key={feature.id}
            data={geojson}
            style={{
              color: "#06b6d4",
              weight: 1.5,
              dashArray: "5, 5",
              fillColor: "#06b6d4",
              fillOpacity: 0.16,
            }}
            onEachFeature={(_, layer) => {
              layer.bindTooltip(
                `<div class="text-xs font-semibold text-cyan-300">🐟 ${feature.name} (Trawling Zone)</div>`,
                { sticky: true, className: "glass-card border border-cyan-500/40 p-1" }
              );
            }}
          />
        ))}

      {/* ── Layer: Shipping Lanes (LineStrings) ────────────────── */}
      {visibility.shippingLanes &&
        parsedShippingLanes.map(({ feature, geojson }) => (
          <GeoJSON
            key={feature.id}
            data={geojson}
            style={{
              color: "#c084fc",
              weight: 2.5,
              dashArray: "8, 6",
              opacity: 0.75,
            }}
            onEachFeature={(_, layer) => {
              layer.bindTooltip(
                `<div class="text-xs font-semibold text-purple-300">🚢 ${feature.name}</div>`,
                { sticky: true, className: "glass-card border border-purple-500/40 p-1" }
              );
            }}
          />
        ))}

      {/* ── Layer: Major Commercial Ports (Markers) ────────────── */}
      {visibility.ports &&
        ports.map((port) => {
          if (port.latitude === null || port.longitude === null) return null;
          return (
            <Marker
              key={port.id}
              position={[port.latitude!, port.longitude!]}
              icon={portIcon}
            >
              <Popup>
                <div className="p-2 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Anchor className="w-3.5 h-3.5 text-amber-400" />
                    <span>{port.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    {port.description || "Commercial maritime cargo port"}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Position: {port.latitude?.toFixed(3)}°N, {port.longitude?.toFixed(3)}°E
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

      {/* ── Layer: Spill Polygons (Geometry from PostGIS) ─────── */}
      {visibility.spillPolygons &&
        parsedPolygons.map(({ incident, geojson }) => {
          const isSelected = selectedIncident?.id === incident.id;
          const color = getSpillColor(incident.severity);
          return (
            <GeoJSON
              key={`poly-${incident.id}`}
              data={geojson}
              style={{
                color: color,
                weight: isSelected ? 3.5 : 2,
                fillColor: color,
                fillOpacity: isSelected ? 0.45 : 0.28,
              }}
              eventHandlers={{
                click: () => onSelectIncident(incident),
              }}
            />
          );
        })}

      {/* ── Selected Incident Proximity Buffer Circle ──────────── */}
      {selectedIncident &&
        selectedIncident.latitude !== null &&
        selectedIncident.longitude !== null && (
          <Circle
            center={[selectedIncident.latitude!, selectedIncident.longitude!]}
            radius={radiusKm * 1000}
            pathOptions={{
              color: "#38bdf8",
              fillColor: "#0284c7",
              fillOpacity: 0.08,
              dashArray: "6, 6",
              weight: 1.5,
            }}
          />
        )}

      {/* ── Layer: Oil Spill Incident Markers ──────────────────── */}
      {visibility.incidents &&
        incidents.map((incident) => {
          if (incident.latitude === null || incident.longitude === null) return null;
          const isSelected = selectedIncident?.id === incident.id;
          return (
            <Marker
              key={incident.id}
              position={[incident.latitude!, incident.longitude!]}
              icon={createIncidentIcon(incident.severity, isSelected)}
              eventHandlers={{
                click: () => onSelectIncident(incident),
              }}
            >
              <Popup>
                <div className="p-2 space-y-2 min-w-[210px]">
                  <div className="flex items-center justify-between gap-2 border-b border-ocean-800 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-red-400" />
                      <span className="font-bold text-xs text-white">
                        {incident.incident_code}
                      </span>
                    </div>
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                        incident.severity === "CRITICAL"
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : incident.severity === "HIGH"
                          ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                          : incident.severity === "MODERATE"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                      }`}
                    >
                      {incident.severity}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="bg-ocean-900/60 p-1 rounded">
                      <div className="text-[9px] text-slate-400 uppercase">Risk Score</div>
                      <div className="font-bold text-amber-400 font-mono">
                        {incident.risk_score !== null ? incident.risk_score.toFixed(1) : "N/A"}
                      </div>
                    </div>
                    <div className="bg-ocean-900/60 p-1 rounded">
                      <div className="text-[9px] text-slate-400 uppercase">Spill Area</div>
                      <div className="font-bold text-slate-200">
                        {incident.spill_area_km2 ? `${incident.spill_area_km2} km²` : "N/A"}
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400">
                    <div>Status: <span className="text-slate-200 font-semibold">{incident.status.replace(/_/g, " ")}</span></div>
                    <div>Coords: {incident.latitude?.toFixed(3)}°N, {incident.longitude?.toFixed(3)}°E</div>
                  </div>

                  <div className="pt-1 border-t border-ocean-800 flex items-center justify-between gap-1.5">
                    <button
                      onClick={() => onSelectIncident(incident)}
                      className="flex-1 py-1 px-2 bg-ocean-700 hover:bg-ocean-600 text-white rounded text-[10px] font-semibold transition text-center"
                    >
                      Spatial Analysis
                    </button>
                    <Link
                      to={`/incidents?selected=${incident.id}`}
                      className="py-1 px-2 bg-ocean-500 hover:bg-ocean-400 text-white rounded text-[10px] font-semibold transition flex items-center gap-1 shrink-0"
                    >
                      <span>Details</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </Link>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

      {/* ── Layer: Vessel Trajectories (AIS Tracks Passing Near/Through Spills) ── */}
      {visibility.vessels &&
        vessels.map((vessel) => {
          if (!vessel.trajectory || vessel.trajectory.length < 2) return null;
          const suspectMatch = suspectMmsiMap.get(vessel.mmsi);
          const isSuspect = vessel.is_suspect || !!suspectMatch;
          const isHighlighted = highlightedVesselId === vessel.id;
          const latLngs = vessel.trajectory.map(([lat, lon]) => [lat, lon] as [number, number]);

          return (
            <Polyline
              key={`traj-${vessel.id}`}
              positions={latLngs}
              pathOptions={{
                color: isSuspect ? "#f43f5e" : isHighlighted ? "#38bdf8" : "#0284c7",
                weight: isSuspect ? 3 : isHighlighted ? 2.5 : 1.5,
                opacity: isSuspect ? 0.9 : isHighlighted ? 0.85 : 0.45,
                dashArray: isSuspect ? "6, 4" : "4, 6",
              }}
            />
          );
        })}

      {/* ── Layer: Active Commercial Vessels & Suspect Ships ─────────── */}
      {visibility.vessels &&
        vessels.map((vessel) => {
          const suspectMatch = suspectMmsiMap.get(vessel.mmsi);
          const isSuspect = vessel.is_suspect || !!suspectMatch;
          const isHighlighted = highlightedVesselId === vessel.id;
          const leakProb = suspectMatch?.leak_probability_score ?? vessel.leak_probability;

          return (
            <Marker
              key={`vessel-${vessel.id}`}
              position={[vessel.current_lat, vessel.current_lon]}
              icon={createVesselIcon(vessel, isSuspect, isHighlighted)}
              eventHandlers={{
                click: () => onSelectVessel?.(vessel.id),
              }}
            >
              <Popup>
                <div className="p-2.5 space-y-2 min-w-[230px]">
                  <div className="flex items-center justify-between gap-1.5 border-b border-ocean-800 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-sky-400" />
                      <span className="font-bold text-xs text-white truncate max-w-[140px]">
                        {vessel.name}
                      </span>
                    </div>
                    {isSuspect && (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
                        SUSPECT SHIP
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-300 space-y-1">
                    <div className="text-[10px] text-slate-400">{vessel.vessel_type}</div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span>Flag: <span className="text-white">{vessel.flag}</span></span>
                      <span>Speed: <span className="font-mono text-cyan-300 font-bold">{vessel.speed_knots} kn</span></span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Heading: <span className="text-slate-200">{vessel.heading_deg}°</span> • MMSI: <span className="font-mono text-slate-200">{vessel.mmsi}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      Route: <span className="text-slate-200">{vessel.destination}</span>
                    </div>
                  </div>

                  {isSuspect && (
                    <div className="bg-red-950/70 border border-red-500/40 rounded p-2 text-[10px] text-red-200 space-y-1">
                      <div className="font-bold flex items-center justify-between text-red-300">
                        <span>🚨 Leak Attribution Priority:</span>
                        <span className="text-xs font-mono font-black text-amber-300">
                          {leakProb ? `${leakProb}%` : "PRIMARY"}
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-300">
                        AIS trajectory directly traversed the detected slick area!
                      </div>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

      {/* ── Layer: Oil Spill Movement Prediction Trajectory ── */}
      {visibility.movementPrediction && movementPrediction && movementTrajectory.length > 1 && (
        <>
          {/* Uncertainty Corridor (GeoJSON polygon) */}
          {movementPrediction.uncertainty_corridor_geojson && (() => {
            try {
              const corridorGeojson = JSON.parse(movementPrediction.uncertainty_corridor_geojson);
              return (
                <GeoJSON
                  key={`corridor-${movementPrediction.id}`}
                  data={corridorGeojson}
                  style={{
                    color: "#e879f9",
                    weight: 1,
                    dashArray: "4, 6",
                    fillColor: "#e879f9",
                    fillOpacity: 0.08,
                    opacity: 0.45,
                  }}
                />
              );
            } catch { return null; }
          })()}

          {/* Main Drift Trajectory Polyline */}
          <Polyline
            key={`drift-${movementPrediction.id}`}
            positions={movementTrajectory}
            pathOptions={{
              color: "#e879f9",
              weight: 2.5,
              opacity: 0.85,
              dashArray: "10, 6",
            }}
          />

          {/* Origin marker */}
          <Circle
            key={`origin-${movementPrediction.id}`}
            center={[movementPrediction.origin_latitude, movementPrediction.origin_longitude]}
            radius={movementPrediction.origin_area_km2 ? Math.sqrt(movementPrediction.origin_area_km2 * 1e6 / Math.PI) : 3000}
            pathOptions={{
              color: "#e879f9",
              weight: 2,
              fillColor: "#e879f9",
              fillOpacity: 0.22,
            }}
          />

          {/* Forecast Milestone Markers */}
          {movementPrediction.forecast_points.map((fp, idx) => {
            const horizonLabel = fp.horizon_hours === 1 ? "+1h" :
              fp.horizon_hours === 3 ? "+3h" :
              fp.horizon_hours === 6 ? "+6h" :
              fp.horizon_hours === 12 ? "+12h" : "+24h";
            const opacity = 0.4 + (idx / movementPrediction.forecast_points.length) * 0.6;

            const milestoneIcon = L.divIcon({
              className: "movement-milestone-pin",
              html: `
                <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                  <div style="
                    background: rgba(232, 121, 249, ${opacity});
                    border: 1.5px solid #e879f9;
                    border-radius: 50%;
                    width: 22px; height: 22px;
                    display: flex; align-items: center; justify-content: center;
                    box-shadow: 0 0 8px rgba(232, 121, 249, 0.6);
                  ">
                    <span style="font-size: 8px; font-weight: 800; color: #fff; font-family: monospace;">${horizonLabel}</span>
                  </div>
                </div>
              `,
              iconSize: [22, 22],
              iconAnchor: [11, 11],
              popupAnchor: [0, -13],
            });

            return (
              <Marker
                key={`milestone-${movementPrediction.id}-${fp.horizon_hours}`}
                position={[fp.latitude, fp.longitude]}
                icon={milestoneIcon}
              >
                <Popup>
                  <div className="p-2 space-y-1.5 min-w-[190px]">
                    <div className="flex items-center gap-1.5 border-b border-ocean-800 pb-1">
                      <Wind className="w-3.5 h-3.5 text-fuchsia-400" />
                      <span className="font-bold text-xs text-fuchsia-300">
                        Drift Forecast {horizonLabel}
                      </span>
                      {movementPrediction.is_simulated && (
                        <span className="ml-auto text-[8px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 py-0.5 rounded font-bold">
                          SIMULATED
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <div className="bg-ocean-900/60 p-1 rounded">
                        <div className="text-[9px] text-slate-400 uppercase">Position</div>
                        <div className="font-mono text-fuchsia-200 text-[9px]">
                          {fp.latitude.toFixed(3)}°, {fp.longitude.toFixed(3)}°
                        </div>
                      </div>
                      <div className="bg-ocean-900/60 p-1 rounded">
                        <div className="text-[9px] text-slate-400 uppercase">Distance</div>
                        <div className="font-bold text-slate-200">{fp.distance_km.toFixed(1)} km</div>
                      </div>
                      <div className="bg-ocean-900/60 p-1 rounded">
                        <div className="text-[9px] text-slate-400 uppercase">Direction</div>
                        <div className="font-bold text-slate-200">{fp.bearing_cardinal} ({fp.bearing_deg.toFixed(0)}°)</div>
                      </div>
                      <div className="bg-ocean-900/60 p-1 rounded">
                        <div className="text-[9px] text-slate-400 uppercase">Est. Area</div>
                        <div className="font-bold text-amber-300">{fp.estimated_area_km2.toFixed(2)} km²</div>
                      </div>
                    </div>
                    <div className="text-[9px] text-slate-400 pt-0.5">
                      Wind: {movementPrediction.environmental_conditions.wind_speed_ms.toFixed(1)} m/s •
                      Current: {movementPrediction.environmental_conditions.current_speed_ms.toFixed(2)} m/s
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </>
      )}

      {/* ── Layer: Module 12 Ecosystem Risk Overlay ─────────── */}

      {/* Ecosystem zone circles: rendered from zone_results lat data embedded in response */}
      {visibility.ecosystemRisk && ecosystemRisk && (() => {
        const severityColor = (sev: string) => {
          switch (sev) {
            case "CRITICAL": return "#ef4444";
            case "HIGH":     return "#f97316";
            case "MODERATE": return "#f59e0b";
            default:         return "#22c55e";
          }
        };

        // We render a summary Circle at the selected incident position
        // scaled by overall ecosystem risk score — a visual "ecosystem threat ring"
        if (!selectedIncident?.latitude || !selectedIncident?.longitude) return null;
        const riskRadius = Math.max(8000, (ecosystemRisk.overall_risk_score / 100) * 80000);
        const color = severityColor(ecosystemRisk.overall_severity);

        return (
          <>
            {/* Ecosystem threat ring */}
            <Circle
              center={[selectedIncident.latitude!, selectedIncident.longitude!]}
              radius={riskRadius}
              pathOptions={{
                color: color,
                weight: 1.5,
                dashArray: "8, 6",
                fillColor: color,
                fillOpacity: 0.06,
                opacity: 0.5,
              }}
            >
              <Popup>
                <div className="p-2 space-y-1.5 min-w-[200px]">
                  <div className="flex items-center gap-1.5 border-b border-ocean-800 pb-1">
                    <span className="font-bold text-xs text-emerald-300">🌿 Ecosystem Risk Zone</span>
                    <span className={`ml-auto text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${
                      ecosystemRisk.overall_severity === "CRITICAL" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                      ecosystemRisk.overall_severity === "HIGH" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
                      ecosystemRisk.overall_severity === "MODERATE" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                      "bg-green-500/20 text-green-400 border-green-500/30"
                    }`}>{ecosystemRisk.overall_severity}</span>
                  </div>
                  <div className="text-[10px] text-slate-300">
                    <div>Overall Score: <span className="font-bold text-emerald-300">{ecosystemRisk.overall_risk_score.toFixed(1)}/100</span></div>
                    <div>Zones Analyzed: <span className="font-bold">{ecosystemRisk.zones_analyzed}</span></div>
                    {ecosystemRisk.most_sensitive_zone && (
                      <div>Critical Zone: <span className="font-bold text-amber-300 text-[9px]">{ecosystemRisk.most_sensitive_zone}</span></div>
                    )}
                  </div>
                  {ecosystemRisk.is_simulated && (
                    <div className="text-[9px] text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded px-1.5 py-0.5">
                      ⚠ SIMULATED DATA
                    </div>
                  )}
                </div>
              </Popup>
            </Circle>

            {/* Individual zone markers (distance-decay halos) */}
            {ecosystemRisk.zone_results.map((zone) => (
              <Circle
                key={`eco-zone-${zone.zone_id}`}
                center={[selectedIncident.latitude!, selectedIncident.longitude!]}
                radius={Math.max(2000, (1 - zone.distance_km / ecosystemRisk.radius_km_used) * 30000)}
                pathOptions={{
                  color: severityColor(zone.zone_severity),
                  weight: 1,
                  dashArray: "4, 8",
                  fillColor: severityColor(zone.zone_severity),
                  fillOpacity: 0.04,
                  opacity: 0.35,
                }}
              />
            ))}
          </>
        );
      })()}

      {/* ── Layer: Module 13 Predicted Coastal Impact Pins & Threat Halos ── */}
      {visibility.coastalImpact && coastalImpact && coastalImpact.affected_locations.map((target) => {
        const sevColor =
          target.severity === "CRITICAL" ? "#ef4444" :
          target.severity === "HIGH" ? "#f97316" :
          target.severity === "MODERATE" ? "#f59e0b" : "#22c55e";

        const isUrgent = target.estimated_hours_to_impact <= 6.0;

        const pulseHtml = isUrgent
          ? `<div class="custom-radar-pulse" style="background-color: ${sevColor}70; width: 32px; height: 32px;"></div>`
          : "";

        const impactIcon = L.divIcon({
          className: "coastal-impact-pin",
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center;">
              ${pulseHtml}
              <div style="
                background: #082f49;
                border: 1.5px solid ${sevColor};
                border-radius: 10px;
                padding: 1px 5px;
                display: flex;
                align-items: center;
                gap: 2px;
                box-shadow: 0 0 10px ${sevColor}60;
                font-family: monospace;
                white-space: nowrap;
                cursor: pointer;
              ">
                <span style="color: ${sevColor}; font-size: 8.5px; font-weight: 800;">⚡~${target.estimated_hours_to_impact.toFixed(1)}h</span>
              </div>
            </div>
          `,
          iconSize: [42, 20],
          iconAnchor: [21, 10],
          popupAnchor: [0, -12],
        });

        return (
          <React.Fragment key={`coastal-impact-${target.id}`}>
            {/* Threat buffer circle around threatened coastal target */}
            <Circle
              center={[target.latitude, target.longitude]}
              radius={isUrgent ? 6000 : 3500}
              pathOptions={{
                color: sevColor,
                weight: 1.5,
                dashArray: "4, 6",
                fillColor: sevColor,
                fillOpacity: isUrgent ? 0.16 : 0.08,
                opacity: 0.8,
              }}
            />
            <Marker position={[target.latitude, target.longitude]} icon={impactIcon}>
              <Popup>
                <div className="p-2 space-y-1.5 min-w-[210px]">
                  <div className="flex items-center gap-1.5 border-b border-ocean-800 pb-1">
                    <span className="text-xs font-bold text-cyan-300">⚡ Coastal Threat: {target.impact_horizon}</span>
                    <span className={`ml-auto text-[8px] font-extrabold px-1.5 py-0.5 rounded border ${
                      target.severity === "CRITICAL" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                      target.severity === "HIGH" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
                      target.severity === "MODERATE" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                      "bg-green-500/20 text-green-400 border-green-500/30"
                    }`}>{target.severity}</span>
                  </div>
                  <div className="font-bold text-xs text-slate-100">{target.target_location}</div>
                  <div className="text-[10px] text-cyan-400 font-semibold">{target.target_type.replace(/_/g, " ")}</div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] bg-ocean-950/80 p-1.5 rounded border border-ocean-800">
                    <div>ETA: <span className="font-mono text-cyan-300 font-bold">~{target.estimated_hours_to_impact.toFixed(1)}h</span></div>
                    <div>Distance: <span className="font-bold text-slate-200">{target.distance_km} km</span></div>
                    <div>Probability: <span className="font-bold text-amber-300">{target.impact_probability}%</span></div>
                    <div>Confidence: <span className="font-bold text-emerald-300">{(target.confidence * 100).toFixed(0)}%</span></div>
                  </div>
                  {target.summary_notes && (
                    <p className="text-[9px] text-slate-300 leading-snug">{target.summary_notes}</p>
                  )}
                  <div className="text-[8px] text-amber-400 italic">[ESTIMATED IMPACT] Algorithmic prediction</div>
                </div>
              </Popup>
            </Marker>
          </React.Fragment>
        );
      })}

      {/* ── Layer: Module 14 Emergency Vessel Optimized Response Route ── */}
      {visibility.responseRouting && optimizedRoute && optimizedRoute.waypoints && optimizedRoute.waypoints.length > 1 && (() => {
        const originLat = optimizedRoute.start_latitude ?? optimizedRoute.origin?.latitude ?? 0;
        const originLon = optimizedRoute.start_longitude ?? optimizedRoute.origin?.longitude ?? 0;
        const vesselName = optimizedRoute.vessel?.name ?? optimizedRoute.vessel_name ?? "Emergency Vessel";
        const vesselSpeed = optimizedRoute.vessel?.cruising_speed_knots ?? optimizedRoute.transit_speed_knots ?? 18;
        const vesselType = optimizedRoute.vessel?.vessel_type ?? optimizedRoute.vessel_type ?? "Pollution Response Vessel";
        const homePort = optimizedRoute.vessel?.home_port ?? optimizedRoute.home_port ?? "Port Base";
        const distNm = optimizedRoute.estimated_distance_nm ?? optimizedRoute.total_distance_nm ?? 0;
        const etaHours = optimizedRoute.estimated_travel_time_hours ?? optimizedRoute.total_estimated_hours ?? 0;
        const confScore = optimizedRoute.route_confidence ?? optimizedRoute.confidence_score ?? 0.85;
        const caps = optimizedRoute.vessel?.capabilities ?? [];
        const hasBooms = caps.includes("BOOM_DEPLOYMENT") || Boolean(optimizedRoute.equipment_match?.has_booms);
        const hasSkimmers = caps.includes("OIL_SKIMMING") || Boolean(optimizedRoute.equipment_match?.has_skimmers);
        const hasDispersants = caps.includes("CHEMICAL_DISPERSANT") || Boolean(optimizedRoute.equipment_match?.has_dispersants);

        return (
          <React.Fragment key={`vessel-route-${optimizedRoute.id || optimizedRoute.route_id || "active"}`}>
            {/* Outer glow polyline */}
            <Polyline
              positions={optimizedRoute.waypoints.map((wp: NavigationalWaypoint) => [wp.latitude, wp.longitude] as [number, number])}
              pathOptions={{
                color: "#10b981",
                weight: 4.5,
                dashArray: "8, 8",
                opacity: 0.85,
              }}
            />
            {/* Inner core bright polyline */}
            <Polyline
              positions={optimizedRoute.waypoints.map((wp: NavigationalWaypoint) => [wp.latitude, wp.longitude] as [number, number])}
              pathOptions={{
                color: "#6ee7b7",
                weight: 1.5,
                opacity: 0.95,
              }}
            />

            {/* Response Vessel Origin Marker */}
            <Marker
              position={[originLat, originLon]}
              icon={L.divIcon({
                className: "vessel-origin-pin",
                html: `
                  <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                    <div class="custom-radar-pulse" style="background-color: #10b98170; width: 36px; height: 36px;"></div>
                    <div style="
                      background: #022c22;
                      border: 1.5px solid #10b981;
                      border-radius: 12px;
                      padding: 2px 6px;
                      display: flex;
                      align-items: center;
                      gap: 3px;
                      box-shadow: 0 0 14px #10b98190;
                      font-family: monospace;
                      white-space: nowrap;
                      cursor: pointer;
                    ">
                      <span style="font-size: 11px;">🚢</span>
                      <span style="color: #6ee7b7; font-size: 9px; font-weight: 800;">${vesselName}</span>
                      <span style="color: #34d399; font-size: 8px; font-weight: 600;">[${vesselSpeed}kt]</span>
                    </div>
                  </div>
                `,
                iconSize: [120, 24],
                iconAnchor: [60, 12],
                popupAnchor: [0, -14],
              })}
            >
              <Popup>
                <div className="p-2 space-y-1.5 min-w-[240px]">
                  <div className="flex items-center gap-1.5 border-b border-ocean-800 pb-1">
                    <span className="text-xs font-bold text-emerald-400">🚢 {vesselName}</span>
                    <span className="ml-auto text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      DISPATCH READY
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-300">
                    Type: <span className="font-semibold text-slate-100">{vesselType}</span> | Base: <span className="text-cyan-300 font-semibold">{homePort}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] bg-ocean-950/80 p-1.5 rounded border border-ocean-800">
                    <div>Transit: <span className="font-mono text-emerald-400 font-bold">{distNm} NM</span></div>
                    <div>ETA: <span className="font-mono text-amber-300 font-bold">~{etaHours.toFixed(1)} hrs</span></div>
                    <div>Speed: <span className="font-bold text-slate-200">{vesselSpeed} knots</span></div>
                    <div>Confidence: <span className="font-bold text-emerald-300">{(confScore * 100).toFixed(0)}%</span></div>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[9px] pt-0.5">
                    <span className={`px-1.5 py-0.5 rounded border ${hasBooms ? "bg-emerald-950 text-emerald-300 border-emerald-700" : "bg-slate-900 text-slate-500 border-slate-800"}`}>
                      {hasBooms ? "✓ Booms" : "✗ Booms"}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded border ${hasSkimmers ? "bg-emerald-950 text-emerald-300 border-emerald-700" : "bg-slate-900 text-slate-500 border-slate-800"}`}>
                      {hasSkimmers ? "✓ Skimmers" : "✗ Skimmers"}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded border ${hasDispersants ? "bg-emerald-950 text-emerald-300 border-emerald-700" : "bg-slate-900 text-slate-500 border-slate-800"}`}>
                      {hasDispersants ? "✓ Dispersant" : "✗ Dispersant"}
                    </span>
                  </div>
                  <div className="text-[8px] text-amber-400/90 italic pt-1 border-t border-ocean-900">
                    {optimizedRoute.disclaimer || "[PROTOTYPE MARITIME ROUTE — DECISION SUPPORT ONLY]"}
                  </div>
                </div>
              </Popup>
            </Marker>

            {/* Intermediate Navigational Waypoints */}
            {optimizedRoute.waypoints.slice(1, -1).map((wp: NavigationalWaypoint, i: number) => {
              const wpSeq = wp.sequence ?? (wp.index != null ? wp.index + 1 : i + 2);
              const wpCumNm = wp.cumulative_distance_nm ?? wp.distance_nm_cumulative ?? 0;
              const wpEtaH = wp.leg_eta_hours ?? wp.estimated_hours_cumulative ?? 0;
              const wpName = wp.name ?? wp.note ?? `Waypoint #${wpSeq}`;

              return (
                <Marker
                  key={`route-wp-${wpSeq}-${wp.latitude}`}
                  position={[wp.latitude, wp.longitude]}
                  icon={L.divIcon({
                    className: "nav-waypoint-pin",
                    html: `
                      <div style="
                        width: 16px;
                        height: 16px;
                        background: #064e3b;
                        border: 1.5px solid #34d399;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 8px;
                        font-weight: 800;
                        color: #a7f3d0;
                        box-shadow: 0 0 6px #10b981;
                      ">
                        ${wpSeq}
                      </div>
                    `,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8],
                    popupAnchor: [0, -8],
                  })}
                >
                  <Popup>
                    <div className="p-1.5 space-y-1 text-xs min-w-[160px]">
                      <div className="font-bold text-emerald-300">Waypoint #{wpSeq}</div>
                      <div className="text-[10px] text-slate-200">{wpName}</div>
                      <div className="text-[10px] text-slate-300">
                        Cumulative: <span className="font-mono text-emerald-400 font-semibold">{wpCumNm} NM</span>
                      </div>
                      <div className="text-[10px] text-slate-300">
                        Est. Transit: <span className="font-mono text-amber-300 font-semibold">~{wpEtaH.toFixed(1)} hrs</span>
                      </div>
                      <div className="text-[8px] text-slate-400 font-mono">
                        {wp.latitude.toFixed(3)}°N, {wp.longitude.toFixed(3)}°E
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </React.Fragment>
        );
      })()}

      {/* Module 18: Probable Spill Source Region & Reverse Trajectory */}
      {visibility.sourceAnalysis && sourceAnalysis && (
        <React.Fragment>
          {/* Reverse Trajectory Polyline */}
          {sourceAnalysis.reverse_trajectory && sourceAnalysis.reverse_trajectory.length > 1 && (
            <Polyline
              positions={sourceAnalysis.reverse_trajectory.map((pt) => [pt.lat, pt.lng] as [number, number])}
              pathOptions={{
                color: "#6366f1",
                weight: 3.5,
                dashArray: "6, 6",
                opacity: 0.85,
              }}
            />
          )}

          {/* Candidate Source Areas */}
          {sourceAnalysis.candidates && sourceAnalysis.candidates.map((cand) => {
            const isTop = cand.region_code === "Region A";
            return (
              <React.Fragment key={cand.id || cand.region_code}>
                <Circle
                  center={[cand.center_lat, cand.center_lng]}
                  radius={cand.radius_km * 1000}
                  pathOptions={{
                    color: isTop ? "#6366f1" : "#a855f7",
                    fillColor: isTop ? "#6366f1" : "#a855f7",
                    fillOpacity: isTop ? 0.22 : 0.14,
                    weight: isTop ? 2.5 : 1.5,
                    dashArray: isTop ? undefined : "4, 4",
                  }}
                />
                <Marker
                  position={[cand.center_lat, cand.center_lng]}
                  icon={L.divIcon({
                    className: "candidate-source-pin",
                    html: `
                      <div style="
                        background: #1e1b4b;
                        border: 1.5px solid ${isTop ? "#818cf8" : "#c084fc"};
                        border-radius: 8px;
                        padding: 2px 6px;
                        display: flex;
                        align-items: center;
                        gap: 3px;
                        box-shadow: 0 0 10px rgba(99, 102, 241, 0.6);
                        font-family: monospace;
                        white-space: nowrap;
                        cursor: pointer;
                      ">
                        <span style="font-size: 10px;">🎯</span>
                        <span style="color: ${isTop ? "#a5b4fc" : "#e9d5ff"}; font-size: 9px; font-weight: 800;">
                          ${cand.region_code} (${cand.confidence_percentage}%)
                        </span>
                      </div>
                    `,
                    iconSize: [110, 22],
                    iconAnchor: [55, 11],
                    popupAnchor: [0, -12],
                  })}
                >
                  <Popup>
                    <div className="p-2 space-y-1.5 min-w-[240px]">
                      <div className="flex items-center gap-1.5 border-b border-ocean-800 pb-1">
                        <span className="text-xs font-bold text-indigo-300">🎯 {cand.region_code}: {cand.region_name}</span>
                        <span className="ml-auto text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {cand.confidence_percentage}% CONFIDENCE
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-300">
                        {cand.summary_notes}
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[10px] bg-ocean-950/80 p-1.5 rounded border border-ocean-800 font-mono">
                        <div>Center: <span className="text-indigo-300 font-bold">{cand.center_lat.toFixed(3)}°N, {cand.center_lng.toFixed(3)}°E</span></div>
                        <div>Radius: <span className="text-slate-200 font-bold">{cand.radius_km} km ({cand.area_km2.toFixed(0)} km²)</span></div>
                        <div>Est. Transit: <span className="text-amber-300 font-bold">{cand.estimated_drift_hours} hrs</span></div>
                        <div>Relevant Vessels: <span className="text-purple-300 font-bold">{cand.potential_vessels_count}</span></div>
                      </div>
                      {cand.shipping_lanes_intersected && cand.shipping_lanes_intersected.length > 0 && (
                        <div className="text-[9px] text-blue-300">
                          Corridors: {cand.shipping_lanes_intersected.join(", ")}
                        </div>
                      )}
                      <div className="text-[8px] text-amber-400/90 italic pt-1 border-t border-ocean-900 leading-snug">
                        Statutory Notice: Probable source modeling is for investigative guidance only. Vessel proximity does not establish liability.
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}
        </React.Fragment>
      )}

      {/* ── Layer: Marine Waste & Debris Incidents ─────────────── */}
      {visibility.marineWaste && wasteLayers && wasteLayers.incidents.features.map((feat: any) => {
        const [lng, lat] = feat.geometry.coordinates;
        const props = feat.properties;
        const sevColor =
          props.severity === "CRITICAL" ? "#ef4444" :
          props.severity === "HIGH" ? "#f97316" :
          props.severity === "MODERATE" ? "#eab308" : "#10b981";

        const wasteIcon = L.divIcon({
          className: "marine-waste-marker-pin",
          html: `
            <div style="
              width: 28px;
              height: 28px;
              border-radius: 50%;
              background: #064e3b;
              border: 2px solid ${sevColor};
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 0 12px ${sevColor}99;
              cursor: pointer;
            ">
              <span style="font-size: 14px;">🌊</span>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14],
        });

        return (
          <Marker key={`waste-${props.id}`} position={[lat, lng]} icon={wasteIcon}>
            <Popup>
              <div className="p-2 space-y-2 min-w-[220px]">
                <div className="flex items-center justify-between gap-1.5 border-b border-ocean-800 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">🌊</span>
                    <span className="font-bold text-xs text-emerald-300">
                      {props.incident_code}
                    </span>
                  </div>
                  <span
                    className="text-[9px] font-extrabold px-1.5 py-0.5 rounded border"
                    style={{
                      color: sevColor,
                      borderColor: `${sevColor}66`,
                      backgroundColor: `${sevColor}22`,
                    }}
                  >
                    {props.severity}
                  </span>
                </div>

                <div className="text-[11px] text-slate-200 font-semibold">
                  {props.waste_type.replace(/_/g, " ")}
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="bg-ocean-900/60 p-1.5 rounded">
                    <div className="text-[8px] text-slate-400 uppercase">Pollution Score</div>
                    <div className="font-bold text-emerald-400 font-mono text-xs">
                      {props.pollution_score}/100
                    </div>
                  </div>
                  <div className="bg-ocean-900/60 p-1.5 rounded">
                    <div className="text-[8px] text-slate-400 uppercase">Priority</div>
                    <div className="font-bold text-amber-300 text-xs">
                      {props.cleanup_priority}
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 space-y-0.5">
                  <div>Density: <span className="text-slate-200">{props.density}</span></div>
                  <div>Status: <span className="text-slate-200 uppercase">{props.status}</span></div>
                  {props.entanglement_hazard && (
                    <div className="text-rose-400 font-bold">⚠️ High Entanglement Risk</div>
                  )}
                  {props.navigation_hazard && (
                    <div className="text-amber-400 font-bold">⚓ Navigation Hazard</div>
                  )}
                </div>

                <div className="pt-1 border-t border-ocean-800 flex justify-end">
                  <Link
                    to="/admin/marine-waste"
                    className="py-1 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-semibold transition"
                  >
                    Open in Waste Desk →
                  </Link>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

    </MapContainer>
  );
};
