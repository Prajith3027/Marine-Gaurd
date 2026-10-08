import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  MapCanvas,
} from "../components/map/MapCanvas";
import {
  MapLayerControls,
  type LayerVisibility,
} from "../components/map/MapLayerControls";
import { MapLegend } from "../components/map/MapLegend";
import { SpatialAnalysisPanel } from "../components/map/SpatialAnalysisPanel";
import { MapSearchBar, type GISModuleFilter } from "../components/map/MapSearchBar";
import apiService from "../services/api";
import { wasteApi, type WasteGISLayers } from "../services/wasteApi";
import type {
  MapLayersResponse,
  MapIncidentPoint,
  NearbyZonesResponse,
  IncidentSeverity,
  ActiveVesselPoint,
  SuspectVesselsResponse,
  MovementPredictionResponse,
  EcosystemRiskResponse,
  CoastalImpactResponse,
  OptimizedRouteResponse,
  SourceAnalysisResponse,
} from "../types";
import { AlertTriangle, RefreshCw, Globe, CheckCircle2 } from "lucide-react";

export default function MapView() {
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get("incidentId");

  const [layersData, setLayersData] = useState<MapLayersResponse | null>(null);
  const [wasteLayers, setWasteLayers] = useState<WasteGISLayers | null>(null);
  const [vessels, setVessels] = useState<ActiveVesselPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIncident, setSelectedIncident] = useState<MapIncidentPoint | null>(null);
  const [nearbyData, setNearbyData] = useState<NearbyZonesResponse | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState<boolean>(false);
  const [radiusKm, setRadiusKm] = useState<number>(50);

  // Suspect Vessel Attribution
  const [suspectData, setSuspectData] = useState<SuspectVesselsResponse | null>(null);
  const [suspectLoading, setSuspectLoading] = useState<boolean>(false);
  const [highlightedVesselId, setHighlightedVesselId] = useState<string | null>(null);
  const [alertSuccess, setAlertSuccess] = useState<string | null>(null);

  // Module 11: Movement Prediction
  const [movementPrediction, setMovementPrediction] = useState<MovementPredictionResponse | null>(null);

  // Module 12: Ecosystem Risk
  const [ecosystemRisk, setEcosystemRisk] = useState<EcosystemRiskResponse | null>(null);
  const [coastalImpact, setCoastalImpact] = useState<CoastalImpactResponse | null>(null);

  // Module 14: Emergency Vessel Optimized Route
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRouteResponse | null>(null);

  // Module 18: Probable Spill Source Analyzer
  const [sourceAnalysis, setSourceAnalysis] = useState<SourceAnalysisResponse | null>(null);

  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | "ALL">("ALL");
  const [moduleFilter, setModuleFilter] = useState<GISModuleFilter>("ALL");
  const [basemap, setBasemap] = useState<"dark" | "satellite" | "osm">("dark");

  const [mapCenter, setMapCenter] = useState<[number, number]>([10.0, 75.0]);
  const [mapZoom, setMapZoom] = useState<number>(4);

  const REGION_PRESETS = [
    { label: "Global Oceans", center: [18.0, 45.0] as [number, number], zoom: 3 },
    { label: "Deep Indian Ocean", center: [-2.0, 78.0] as [number, number], zoom: 4 },
    { label: "Arabian Sea & Gulf", center: [20.0, 60.0] as [number, number], zoom: 5 },
    { label: "Bay of Bengal & Malacca", center: [6.0, 95.0] as [number, number], zoom: 5 },
    { label: "India Coastal", center: [15.0, 78.0] as [number, number], zoom: 5 },
    { label: "Atlantic & Gulf of Mexico", center: [25.0, -85.0] as [number, number], zoom: 4 },
    { label: "Europe & North Sea", center: [48.0, 10.0] as [number, number], zoom: 4 },
  ];

  const [visibility, setVisibility] = useState<LayerVisibility>({
    incidents: true,
    vessels: true,
    spillPolygons: true,
    movementPrediction: true,
    ecosystemRisk: true,
    coastalImpact: true,
    protectedAreas: true,
    fishingZones: true,
    ports: true,
    shippingLanes: true,
    coastline: true,
    responseRouting: true,
    sourceAnalysis: true,
    marineWaste: true,
  });

  // Fetch all map layers & live vessel traffic
  const fetchLayers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [layers, vesselRes, wasteData] = await Promise.all([
        apiService.getMapLayers(true),
        apiService.getLiveVessels().catch(() => ({ total: 0, vessels: [] })),
        wasteApi.getMapLayers().catch(() => null),
      ]);
      setLayersData(layers);
      setVessels(vesselRes.vessels || []);
      setWasteLayers(wasteData ? { incidents: wasteData } : null);

      // If preselected incident from query param, select it
      if (preselectedId && layers.incidents.length > 0) {
        const found = layers.incidents.find((i: MapIncidentPoint) => i.id === preselectedId);
        if (found && found.latitude && found.longitude) {
          setSelectedIncident(found);
          setMapCenter([found.latitude, found.longitude]);
          setMapZoom(9);
        }
      }
    } catch (err: any) {
      console.error("Failed to load map layers:", err);
      setError(err.message || "Failed to load GIS geospatial layers.");
    } finally {
      setLoading(false);
    }
  }, [preselectedId]);

  useEffect(() => {
    fetchLayers();
  }, [fetchLayers]);

  // Fetch nearby environmental zones and suspect vessels when selected incident changes
  useEffect(() => {
    if (!selectedIncident) {
      setNearbyData(null);
      setSuspectData(null);
      setHighlightedVesselId(null);
      return;
    }

    let isMounted = true;
    const loadProximityAndSuspects = async () => {
      try {
        setNearbyLoading(true);
        setSuspectLoading(true);
        const [zonesRes, suspectsRes] = await Promise.all([
          apiService.getNearbyZones(selectedIncident.id, radiusKm),
          apiService.getSuspectVessels(selectedIncident.id).catch(() => null),
        ]);
        if (isMounted) {
          setNearbyData(zonesRes);
          setSuspectData(suspectsRes);
        }
      } catch (err) {
        console.error("Error fetching proximity/suspects:", err);
      } finally {
        if (isMounted) {
          setNearbyLoading(false);
          setSuspectLoading(false);
        }
      }
    };

    loadProximityAndSuspects();
    return () => {
      isMounted = false;
    };
  }, [selectedIncident, radiusKm]);

  // Module 11: Fetch movement prediction when incident is selected
  useEffect(() => {
    if (!selectedIncident) {
      setMovementPrediction(null);
      return;
    }
    let isMounted = true;
    apiService.getMovementPrediction(selectedIncident.id)
      .then((res) => { if (isMounted) setMovementPrediction(res); })
      .catch(() => {
        // If no prediction yet, try to auto-run one
        if (!isMounted) return;
        apiService.runMovementPrediction(selectedIncident.id, {})
          .then((res) => { if (isMounted) setMovementPrediction(res); })
          .catch(() => { if (isMounted) setMovementPrediction(null); });
      });
    return () => { isMounted = false; };
  }, [selectedIncident?.id]);

  // Module 12: Fetch ecosystem risk when incident is selected
  useEffect(() => {
    if (!selectedIncident) {
      setEcosystemRisk(null);
      return;
    }
    let isMounted = true;
    apiService.getEcosystemRisk(selectedIncident.id)
      .then((res) => { if (isMounted) setEcosystemRisk(res); })
      .catch(() => {
        // No existing analysis — auto-run one
        if (!isMounted) return;
        apiService.analyzeEcosystemRisk(selectedIncident.id, { radius_km: 500 })
          .then((res) => { if (isMounted) setEcosystemRisk(res); })
          .catch(() => { if (isMounted) setEcosystemRisk(null); });
      });
    return () => { isMounted = false; };
  }, [selectedIncident?.id]);

  // Module 13: Fetch coastal impact when incident is selected
  useEffect(() => {
    if (!selectedIncident) {
      setCoastalImpact(null);
      return;
    }
    let isMounted = true;
    apiService.getCoastalImpact(selectedIncident.id)
      .then((res) => { if (isMounted) setCoastalImpact(res); })
      .catch(() => {
        if (!isMounted) return;
        apiService.runCoastalImpactPredict(selectedIncident.id, {})
          .then((res) => { if (isMounted) setCoastalImpact(res); })
          .catch(() => { if (isMounted) setCoastalImpact(null); });
      });
    return () => { isMounted = false; };
  }, [selectedIncident?.id]);

  // Module 14: Emergency Vessel Response Route
  useEffect(() => {
    if (!selectedIncident) {
      setOptimizedRoute(null);
      return;
    }
    let isMounted = true;
    apiService.optimizeRoute(selectedIncident.id, {})
      .then((res) => { if (isMounted) setOptimizedRoute(res); })
      .catch(() => { if (isMounted) setOptimizedRoute(null); });
    return () => { isMounted = false; };
  }, [selectedIncident?.id]);

  // Module 18: Fetch probable spill source analysis when incident is selected
  useEffect(() => {
    if (!selectedIncident) {
      setSourceAnalysis(null);
      return;
    }
    let isMounted = true;
    apiService.getSourceAnalysis(selectedIncident.id)
      .then((res) => { if (isMounted) setSourceAnalysis(res); })
      .catch(() => { if (isMounted) setSourceAnalysis(null); });
    return () => { isMounted = false; };
  }, [selectedIncident?.id]);

  const handleSelectIncident = (incident: MapIncidentPoint) => {
    setSelectedIncident(incident);
    if (incident.latitude && incident.longitude) {
      setMapCenter([incident.latitude, incident.longitude]);
      setMapZoom(9);
    }
  };

  const handleResetView = () => {
    setSelectedIncident(null);
    setNearbyData(null);
    setSuspectData(null);
    setHighlightedVesselId(null);
    setMovementPrediction(null);
    setEcosystemRisk(null);
    setCoastalImpact(null);
    setOptimizedRoute(null);
    setSourceAnalysis(null);
    setMapCenter([10.0, 75.0]);
    setMapZoom(4);
  };

  const handleHighlightVessel = (vesselId: string) => {
    setHighlightedVesselId((prev) => (prev === vesselId ? null : vesselId));
    // Find vessel in active list or suspect list to center map
    const v = vessels.find((x) => x.id === vesselId);
    if (v) {
      setMapCenter([v.current_lat, v.current_lon]);
      setMapZoom(8);
    }
  };

  const handleAlertVessel = async (vesselId: string) => {
    if (!selectedIncident) return;
    try {
      await apiService.dispatchVesselAlert(vesselId, {
        incident_id: selectedIncident.id,
        alert_type: "MRCC_INTERCEPT_NOTICE",
        officer_notes: "Immediate Coast Guard interception requested for primary suspect ship passing through oil slick.",
      });
      setAlertSuccess(`🚨 Coast Guard MRCC Intercept Notice issued for ${vesselId}!`);
      setTimeout(() => setAlertSuccess(null), 5000);
    } catch (err: any) {
      console.error("Alert dispatch failed:", err);
    }
  };

  const handleLayerToggle = (key: keyof LayerVisibility) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleModuleFilterChange = (mod: GISModuleFilter) => {
    setModuleFilter(mod);
    if (mod === "ALL") {
      setVisibility((prev) => ({
        ...prev,
        incidents: true,
        spillPolygons: true,
        marineWaste: true,
      }));
    } else if (mod === "OIL_SPILL") {
      setVisibility((prev) => ({
        ...prev,
        incidents: true,
        spillPolygons: true,
        marineWaste: false,
      }));
    } else if (mod === "MARINE_WASTE") {
      setVisibility((prev) => ({
        ...prev,
        incidents: false,
        spillPolygons: false,
        marineWaste: true,
      }));
    }
  };

  // Filtered oil spill incidents based on severity
  const visibleIncidents = (layersData?.incidents || []).filter((inc) => {
    if (severityFilter === "ALL") return true;
    return inc.severity === severityFilter;
  });

  // Filtered marine waste layer features based on severity
  const visibleWasteLayers = useMemo(() => {
    if (!wasteLayers) return null;
    if (severityFilter === "ALL") return wasteLayers;
    return {
      ...wasteLayers,
      incidents: {
        ...wasteLayers.incidents,
        features: (wasteLayers.incidents.features || []).filter(
          (f: any) => f.properties?.severity === severityFilter
        ),
      },
    };
  }, [wasteLayers, severityFilter]);

  return (
    <div className="relative w-full h-[calc(100vh-70px)] overflow-hidden bg-[#020b17]">
      {/* Top Search & Filter Bar */}
      {layersData && (
        <MapSearchBar
          incidents={layersData.incidents}
          selectedIncident={selectedIncident}
          onSelectIncident={handleSelectIncident}
          severityFilter={severityFilter}
          onSeverityFilterChange={setSeverityFilter}
          moduleFilter={moduleFilter}
          onModuleFilterChange={handleModuleFilterChange}
        />
      )}

      {/* Oceanic Region Quick Jumper */}
      <div className="absolute top-16 left-4 z-[1000] hidden md:flex items-center gap-1 p-1 rounded-xl bg-white/95 border border-[#D9E8F2] shadow-xl backdrop-blur-md">
        <span className="text-[10px] uppercase font-bold text-[#1268B3] px-2 select-none flex items-center gap-1">
          <Globe className="w-3 h-3 text-[#1268B3]" />
          Ocean Basin:
        </span>
        {REGION_PRESETS.map((r) => (
          <button
            key={r.label}
            onClick={() => {
              setMapCenter(r.center);
              setMapZoom(r.zoom);
            }}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold text-[#5E7183] hover:text-[#1268B3] hover:bg-[#F3FAFE] transition cursor-pointer"
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Layer Toggles HUD (Top Right) */}
      {layersData && (
        <MapLayerControls
          visibility={visibility}
          onChange={handleLayerToggle}
          counts={{
            incidents: visibleIncidents.length,
            vessels: vessels.length,
            protectedAreas: layersData.protected_areas.length,
            fishingZones: layersData.fishing_zones.length,
            ports: layersData.ports.length,
            shippingLanes: layersData.shipping_lanes.length,
          }}
          onResetView={handleResetView}
        />
      )}

      {/* Spatial Proximity & Suspect Vessel Attribution Drawer (Top Left) */}
      <SpatialAnalysisPanel
        incident={selectedIncident}
        nearbyData={nearbyData}
        suspectData={suspectData}
        loading={nearbyLoading}
        loadingSuspects={suspectLoading}
        radiusKm={radiusKm}
        onRadiusChange={setRadiusKm}
        onClose={() => setSelectedIncident(null)}
        highlightedVesselId={highlightedVesselId}
        onHighlightVessel={handleHighlightVessel}
        onAlertVessel={handleAlertVessel}
      />

      {/* Alert toast notification */}
      {alertSuccess && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1300] bg-white border-2 border-[#087F68] text-[#087F68] px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-bold animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-[#087F68] shrink-0" />
          <span>{alertSuccess}</span>
        </div>
      )}

      {/* Map Legend (Bottom Right) */}
      <MapLegend />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1200] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center text-[#17324D] gap-3">
          <div className="w-10 h-10 border-4 border-[#1268B3] border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-bold tracking-wide">
            Initializing GIS Geographic Intelligence Engine...
          </div>
          <div className="text-xs text-[#5E7183]">
            Querying PostGIS spill polygons &amp; maritime zones
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1200] bg-white p-6 max-w-md text-center border border-[#F5B5BC] rounded-2xl shadow-2xl">
          <AlertTriangle className="w-10 h-10 text-[#C6283D] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#17324D] mb-2">GIS Data Error</h3>
          <p className="text-xs text-[#5E7183] mb-4">{error}</p>
          <button
            onClick={fetchLayers}
            className="btn-primary inline-flex items-center gap-2 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      )}

      {/* Basemap Switcher (Bottom Left) */}
      <div className="absolute bottom-6 left-6 z-[1000] p-1 rounded-xl flex items-center gap-1 border border-[#D9E8F2] bg-white/95 shadow-xl backdrop-blur-md">
        <span className="text-[10px] uppercase font-bold text-[#5E7183] px-2 select-none">
          Basemap:
        </span>
        <button
          onClick={() => setBasemap("dark")}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
            basemap === "dark"
              ? "bg-[#1268B3] text-white shadow-xs"
              : "text-[#5E7183] hover:text-[#17324D] hover:bg-[#F3FAFE]"
          }`}
        >
          Dark Tactical
        </button>
        <button
          onClick={() => setBasemap("satellite")}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
            basemap === "satellite"
              ? "bg-[#1268B3] text-white shadow-xs"
              : "text-[#5E7183] hover:text-[#17324D] hover:bg-[#F3FAFE]"
          }`}
        >
          Satellite Imagery
        </button>
        <button
          onClick={() => setBasemap("osm")}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
            basemap === "osm"
              ? "bg-[#1268B3] text-white shadow-xs"
              : "text-[#5E7183] hover:text-[#17324D] hover:bg-[#F3FAFE]"
          }`}
        >
          Street Map
        </button>
      </div>

      {/* Main Leaflet Map Canvas */}
      {layersData && (
        <MapCanvas
          incidents={visibleIncidents}
          protectedAreas={layersData.protected_areas}
          fishingZones={layersData.fishing_zones}
          ports={layersData.ports}
          shippingLanes={layersData.shipping_lanes}
          vessels={vessels}
          suspectVessels={suspectData?.suspects}
          highlightedVesselId={highlightedVesselId}
          onSelectVessel={handleHighlightVessel}
          movementPrediction={movementPrediction}
          ecosystemRisk={ecosystemRisk}
          coastalImpact={coastalImpact}
          optimizedRoute={optimizedRoute}
          sourceAnalysis={sourceAnalysis}
          coastline={layersData.coastline}
          visibility={visibility}
          selectedIncident={selectedIncident}
          onSelectIncident={handleSelectIncident}
          radiusKm={radiusKm}
          nearbyData={nearbyData}
          mapCenter={mapCenter}
          mapZoom={mapZoom}
          basemap={basemap}
          wasteLayers={visibleWasteLayers}
        />
      )}
    </div>
  );
}
