import { request } from "./http";

export interface PollutionScoreBreakdown {
  waste_density_score: number;
  density_weighted: number;
  affected_area_score: number;
  area_weighted: number;
  distance_coast_score: number;
  distance_weighted: number;
  ecological_sensitivity_score: number;
  sensitivity_weighted: number;
  waste_severity_score: number;
  severity_weighted: number;
  formula_note: string;
}

export interface WasteDetectionResponse {
  detected: boolean;
  waste_type: string;
  confidence: number;
  density: string;
  density_score: number;
  estimated_area_m2: number;
  estimated_items_count: number;
  entanglement_hazard: boolean;
  navigation_hazard: boolean;
  pollution_score: number;
  severity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  cleanup_priority: "P1 — IMMEDIATE" | "P2 — HIGH" | "P3 — MODERATE" | "P4 — LOW";
  score_breakdown: PollutionScoreBreakdown;
  mask_overlay_base64?: string | null;
  processing_time_ms: number;
  image_metadata?: Record<string, any>;
  detection_notes: string;
}

export interface MarineWasteIncident {
  id: string;
  incident_code: string;
  waste_type: string;
  density: string;
  density_score: number;
  estimated_area_m2: number;
  estimated_items_count: number;
  entanglement_hazard: boolean;
  navigation_hazard: boolean;
  pollution_score: number;
  severity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  cleanup_priority: "P1 — IMMEDIATE" | "P2 — HIGH" | "P3 — MODERATE" | "P4 — LOW";
  recommended_action?: string | null;
  status: string;
  latitude: number;
  longitude: number;
  location_name?: string | null;
  distance_from_coast_km?: number | null;
  image_url?: string | null;
  mask_overlay_url?: string | null;
  confidence?: number | null;
  action_taken: string;
  action_notes?: string | null;
  dispatched_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CitizenWasteReportResponse {
  report_id: string;
  report_code: string;
  status: string;
  pollution_type: string;
  waste_type: string;
  incident_code?: string | null;
  pollution_score?: number;
  severity?: string;
  cleanup_priority?: string;
  density?: string;
  estimated_items_count?: number;
  recommended_action?: string;
  image_url?: string | null;
  mask_overlay_url?: string | null;
  message: string;
}

export interface MarineWasteSummary {
  total_incidents: number;
  active_hotspots: number;
  critical_severity_count: number;
  immediate_priority_count: number;
  entanglement_hazards_count: number;
  navigation_hazards_count: number;
  dispatched_actions_count: number;
  resolved_count: number;
  waste_type_breakdown: Record<string, number>;
  severity_breakdown: Record<string, number>;
  priority_breakdown: Record<string, number>;
}

export interface MarineWasteLayerFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    id: string;
    incident_code: string;
    waste_type: string;
    severity: string;
    cleanup_priority: string;
    pollution_score: number;
    density: string;
    estimated_items_count: number;
    location_name: string;
    status: string;
    action_taken: string;
    entanglement_hazard: boolean;
    navigation_hazard: boolean;
  };
}

export interface MarineWasteLayersResponse {
  type: "FeatureCollection";
  features: MarineWasteLayerFeature[];
  total_count: number;
}

export type WasteGISLayers = {
  incidents: MarineWasteLayersResponse;
};

export const wasteApi = {
  detect(formData: FormData): Promise<WasteDetectionResponse> {
    return request<WasteDetectionResponse>("/api/waste/detect", {
      method: "POST",
      body: formData,
    });
  },

  submitReport(formData: FormData): Promise<CitizenWasteReportResponse> {
    return request<CitizenWasteReportResponse>("/api/waste/reports", {
      method: "POST",
      body: formData,
    });
  },

  getReports(status?: string): Promise<any[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return request<any[]>(`/api/waste/reports${q}`);
  },

  getIncidents(params?: { status?: string; waste_type?: string; severity?: string }): Promise<MarineWasteIncident[]> {
    const query = new URLSearchParams();
    if (params?.status && params.status !== "ALL") query.set("status", params.status);
    if (params?.waste_type && params.waste_type !== "ALL") query.set("waste_type", params.waste_type);
    if (params?.severity && params.severity !== "ALL") query.set("severity", params.severity);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return request<MarineWasteIncident[]>(`/api/waste/incidents${qs}`);
  },

  getIncident(id: string): Promise<MarineWasteIncident> {
    return request<MarineWasteIncident>(`/api/waste/incidents/${id}`);
  },

  createIncident(payload: any): Promise<MarineWasteIncident> {
    return request<MarineWasteIncident>("/api/waste/incidents", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  dispatchAction(
    id: string,
    payload: {
      action: string;
      action_notes?: string;
      status_update?: string;
    }
  ): Promise<MarineWasteIncident> {
    return request<MarineWasteIncident>(`/api/waste/incidents/${id}/action`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getSummary(): Promise<MarineWasteSummary> {
    return request<MarineWasteSummary>("/api/waste/summary");
  },

  getMapLayers(): Promise<MarineWasteLayersResponse> {
    return request<MarineWasteLayersResponse>("/api/waste/map/layers");
  },
};
