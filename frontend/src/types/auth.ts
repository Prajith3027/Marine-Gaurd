export type UserRole = "citizen" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login_at?: string | null;
  report_count?: number;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface CitizenTimelineEvent {
  status: string;
  note: string | null;
  at: string;
}

export interface CitizenReportItem {
  id: string;
  report_code: string;
  latitude: number;
  longitude: number;
  location_description?: string | null;
  description: string;
  incident_category: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  observed_at: string;
  status: string;
  photo_url?: string | null;
  video_url?: string | null;
  public_remarks?: string | null;
  created_at: string;
  timeline?: CitizenTimelineEvent[];
}

export interface CitizenDashboardSummary {
  reports_submitted: number;
  reports_under_review: number;
  verified_incidents: number;
  active_alerts: number;
}

export interface PublicAlertItem {
  id: string;
  title: string;
  description: string;
  location?: string | null;
  alert_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "ACTIVE" | "RESOLVED" | "DRAFT";
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
  created_by?: string | null;
}

export interface PublicEmergencyZone {
  id: string;
  title: string;
  severity: string;
  alert_type: string;
  latitude: number;
  longitude: number;
  radius_km: number;
}

export interface PublicSpillsResponse {
  spills: Array<{
    id: string;
    latitude: number;
    longitude: number;
    severity: string;
    status: string;
    area_km2?: number | null;
    detected_at?: string | null;
  }>;
  citizen_reports: Array<{
    id: string;
    latitude: number;
    longitude: number;
    category: string;
    severity?: string | null;
    status: string;
    observed_at?: string | null;
  }>;
  emergency_zones: PublicEmergencyZone[];
}

export interface AdminDashboardSummary {
  active_oil_spills: number;
  reports_received: number;
  reports_under_investigation: number;
  candidate_vessels: number;
  high_risk_incidents: number;
  resolved_incidents: number;
  // Unified Pollution Overview (Phase 6)
  total_pollution_incidents?: number;
  oil_spill_incidents?: number;
  marine_waste_incidents?: number;
  critical_incidents?: number;
  high_priority_incidents?: number;
  pending_actions?: number;
  resolved_pollution_incidents?: number;
}

export interface AdminCitizenReport extends CitizenReportItem {
  citizen?: string | null;
  reporter_contact?: string | null;
  user_id?: string | null;
  verification_confidence: number;
  ai_analysis_notes?: string | null;
  review_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  linked_incident_id?: string | null;
}

export interface VesselFactorBreakdown {
  factor: string;
  weight_pct: number;
  factor_score_pct: number;
  contribution_pts: number;
  explanation: string;
}

export interface RankedVessel {
  rank: number;
  mmsi: string;
  vessel_name: string;
  vessel_type: string;
  flag: string;
  destination: string;
  investigation_score: number;
  classification: string;
  breakdown: VesselFactorBreakdown[];
  trajectory: Array<[number, number]>;
}

export interface VesselRankingResponse {
  incident_id: string;
  incident_code: string;
  incident_latitude: number;
  incident_longitude: number;
  weights: Record<string, number>;
  vessels: RankedVessel[];
  data_origin: string;
  data_note: string;
  hindcast_used: boolean;
  disclaimer: string;
}

export interface AisVesselTrackPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed_knots: number;
  course_deg: number;
}

export interface AisVesselData {
  name: string;
  mmsi: string;
  vessel_type: string;
  flag: string;
  latitude: number;
  longitude: number;
  speed_knots: number;
  course_deg: number;
  heading_deg: number;
  timestamp: string;
  history: AisVesselTrackPoint[];
  distance_from_origin_km: number;
  time_correlation_pct: number;
  trajectory_correlation_pct: number;
  behavioural_anomaly: string;
  anomaly_indicators: string[];
  investigation_score: number;
  classification: string;
}

export interface AisTrackingResponse {
  incident: {
    id: string;
    incident_code: string;
    latitude: number;
    longitude: number;
    severity: string;
    status: string;
    spill_area_km2?: number | null;
    risk_score?: number | null;
  };
  vessels: AisVesselData[];
  data_origin: string;
  data_note: string;
}

export interface HindcastOriginZone {
  name: string;
  latitude: number;
  longitude: number;
  uncertainty_radius_km: number;
  confidence_pct: number;
}

export interface HindcastResponse {
  incident: {
    id: string;
    incident_code: string;
    latitude: number;
    longitude: number;
    severity: string;
    status: string;
    spill_area_km2?: number | null;
  };
  flow: string[];
  probable_origin: HindcastOriginZone | null;
  alternative_origins: HindcastOriginZone[];
  estimated_release_window: {
    start: string;
    end: string;
  };
  overall_confidence_pct: number;
  backward_path: Array<{
    hours_prior: number;
    latitude: number;
    longitude: number;
    uncertainty_radius_km: number;
  }>;
  candidate_vessels: Array<{
    rank: number;
    vessel_name: string;
    mmsi: string;
    investigation_score: number;
    classification: string;
    trajectory: Array<[number, number]>;
  }>;
  data_origin: string;
  data_note: string;
  disclaimer: string;
}

export interface DriftResponse {
  incident: {
    id: string;
    incident_code: string;
    latitude: number;
    longitude: number;
    severity: string;
    status: string;
  };
  current: {
    latitude: number;
    longitude: number;
    area_km2?: number | null;
  };
  forecast: Array<{
    horizon_hours: number;
    timestamp: string;
    latitude: number;
    longitude: number;
    distance_km: number;
    bearing_deg: number;
    bearing_cardinal: string;
    estimated_area_km2: number;
    arrival_time: string;
  }>;
  environmental_conditions: {
    wind_speed_ms: number;
    wind_direction_deg: number;
    current_speed_ms: number;
    current_direction_deg: number;
    water_temp_c?: number;
    wave_height_m?: number;
  };
  confidence: number;
  data_origin: string;
  data_note: string;
}

export interface EvidenceReportResponse {
  generated_at: string;
  incident: {
    id: string;
    incident_code: string;
    latitude: number;
    longitude: number;
    severity: string;
    status: string;
    spill_area_km2?: number | null;
    risk_score?: number | null;
    detection_confidence?: number | null;
    detected_at?: string | null;
  };
  hindcast: {
    primary_source_region: string;
    confidence_pct: number;
    release_window: [string, string];
  } | null;
  vessel_ranking: RankedVessel[];
  linked_citizen_reports: Array<{
    report_code: string;
    status: string;
    category: string;
    observed_at: string;
  }>;
  investigations: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
  }>;
  data_origin: string;
  data_note: string;
  disclaimer: string;
}
