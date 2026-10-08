// ─────────────────────────────────────────────
// API service layer
// Centralises all fetch calls to the FastAPI backend.
// ─────────────────────────────────────────────

import type {
  HealthResponse,
  DashboardSummary,
  IncidentDetail,
  IncidentListResponse,
  MapLayersResponse,
  MapIncidentPoint,
  NearbyZonesResponse,
  IncidentSeverity,
  IncidentStatus,
  IncidentEvent,
  DetectionAnalyzeResponse,
  RiskAssessment,
  RiskCalculateRequest,
  IncidentRiskHistoryResponse,
  RiskSummaryResponse,
  PriorityQueueResponse,
  SuspectVesselsResponse,
  ActiveVesselsResponse,
  MovementPredictionResponse,
  MovementPredictionRequest,
  MovementHistoryItem,
  AvailableVesselsResponse,
  RecommendedVesselsResponse,
  OptimizedRouteResponse,
  RouteOptimizeRequest,
  CleanupPlanResponse,
  CleanupRecommendationItem,
  CleanupPlanGenerateRequest,
  RecommendationStatusUpdateRequest,
  ResourceItem,
  ResourceListResponse,
  ResourceAssignmentItem,
  IncidentResourcesResponse,
  ResourceAssignRequest,
  AssignmentStatusUpdateRequest,
  ResourceStatusUpdateRequest,
  VerificationResponse,
  VerificationEvaluateRequest,
  VerificationEvidenceAddRequest,
  VerificationOverrideRequest,
  SourceAnalysisResponse,
  SourceAnalysisRequest,
  CitizenReportItem,
  CitizenReportCreatePayload,
  CitizenReportStatusUpdatePayload,
  CitizenReportVerifyPayload,
  CitizenReportListResponse,
  SimulationRunItem,
  SimulationRunListItem,
  SimulationCreatePayload,
  SimulationCompareResponse,
  EconomicAssessmentResponse,
  EconomicAssessmentRequest,
  EconomicAssumptionData,
  EnvironmentalRecoveryResponse,
  RecoveryCalculationRequest,
  LifecycleTransitionRequest,
  LifecycleTransitionResponse,
  RecoveryFactorResponse,
  SmartAlertItem,
  AlertListResponse,
  AlertGenerateRequest,
  AlertAcknowledgeRequest,
  RestrictionConfirmRequest,
  AlertRuleItem,
  AlertRuleUpdateRequest,
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantConversationItem,
  AssistantConversationListItem,
} from "../types";


import { request } from "./http";

// ── Health ────────────────────────────────────

export const apiService = {
  /** Check backend health */
  health(): Promise<HealthResponse> {
    return request<HealthResponse>("/health");
  },

  /** Check API v1 root */
  v1Root(): Promise<unknown> {
    return request<unknown>("/api/v1/");
  },

  // ── Dashboard Aggregates ────────────────────

  /** Get real-time aggregated dashboard summary metrics */
  getDashboardSummary(): Promise<DashboardSummary> {
    return request<DashboardSummary>("/api/v1/dashboard/summary");
  },

  // ── Incidents ───────────────────────────────

  /** List incidents with optional filters */
  getIncidents(params?: {
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    min_risk?: number;
    max_risk?: number;
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_order?: "asc" | "desc";
  }): Promise<IncidentListResponse> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
          searchParams.append(key, String(val));
        }
      });
    }
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return request<IncidentListResponse>(`/api/v1/incidents${query}`);
  },

  /** Get single incident details */
  getIncidentById(id: string): Promise<IncidentDetail> {
    return request<IncidentDetail>(`/api/v1/incidents/${id}`);
  },

  /** Update incident status / severity */
  updateIncident(
    id: string,
    payload: Partial<IncidentDetail>
  ): Promise<IncidentDetail> {
    return request<IncidentDetail>(`/api/v1/incidents/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  /** Get incident events / timeline */
  getIncidentEvents(id: string): Promise<IncidentEvent[]> {
    return request<IncidentEvent[]>(`/api/v1/incidents/${id}/events`);
  },

  /** Add an event to an incident timeline */
  addIncidentEvent(
    id: string,
    payload: { event_type: string; description: string; created_by?: string }
  ): Promise<IncidentEvent> {
    return request<IncidentEvent>(`/api/v1/incidents/${id}/events`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── GIS & Map ───────────────────────────────

  /** Get lightweight incident points for map */
  getMapIncidents(activeOnly: boolean = true): Promise<{ incidents: MapIncidentPoint[]; total: number }> {
    return request<{ incidents: MapIncidentPoint[]; total: number }>(
      `/api/v1/map/incidents?active_only=${activeOnly}`
    );
  },

  /** Get all GIS layers (Incidents, Protected Areas, Fishing Zones, Ports, Shipping Lanes, Coastline) */
  getMapLayers(activeOnly: boolean = true): Promise<MapLayersResponse> {
    return request<MapLayersResponse>(
      `/api/v1/map/layers?active_only=${activeOnly}`
    );
  },

  /** Spatial Analysis: Find environmental zones within radius of an incident */
  getNearbyZones(incidentId: string, radiusKm: number = 50): Promise<NearbyZonesResponse> {
    return request<NearbyZonesResponse>(
      `/api/v1/incidents/${incidentId}/nearby-zones?radius_km=${radiusKm}`
    );
  },

  // ── AI Oil Spill Detection ──────────────────

  /** Run AI oil spill detection on image file or demo preset */
  analyzeSpill(formData: FormData): Promise<DetectionAnalyzeResponse> {
    return request<DetectionAnalyzeResponse>("/api/v1/detection/analyze", {
      method: "POST",
      body: formData,
    });
  },

  // ── Risk Engine ─────────────────────────────

  /** Calculate or simulate explainable risk score (0-100) */
  calculateRisk(payload: RiskCalculateRequest): Promise<RiskAssessment> {
    return request<RiskAssessment>("/api/v1/risk/calculate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Get latest risk assessment for an incident */
  getIncidentRisk(incidentId: string): Promise<RiskAssessment> {
    return request<RiskAssessment>(`/api/v1/risk/incident/${incidentId}`);
  },

  /** Get complete historical audit log of risk assessments for an incident */
  getIncidentRiskHistory(incidentId: string): Promise<IncidentRiskHistoryResponse> {
    return request<IncidentRiskHistoryResponse>(`/api/v1/risk/incident/${incidentId}/history`);
  },

  /** Get fleet-wide risk distribution and summary */
  getRiskSummary(): Promise<RiskSummaryResponse> {
    return request<RiskSummaryResponse>("/api/v1/risk/summary");
  },

  // ── Priority Engine ───────────────────────────

  /** Get operational priority queue ranking active incidents by response urgency */
  getPriorityQueue(params?: {
    limit?: number;
    include_resolved?: boolean;
    min_priority?: number;
  }): Promise<PriorityQueueResponse> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          searchParams.append(key, String(val));
        }
      });
    }
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return request<PriorityQueueResponse>(`/api/v1/incidents/priority${query}`);
  },

  // ── Vessel Tracking & Suspect Attribution (AIS) ──

  /** Get suspect vessels that passed near or through an oil spill, ranked by leak priority */
  getSuspectVessels(incidentId: string): Promise<SuspectVesselsResponse> {
    return request<SuspectVesselsResponse>(`/api/v1/vessels/suspect/${incidentId}`);
  },

  /** Get active vessel traffic and suspect paths for the interactive map */
  getLiveVessels(): Promise<ActiveVesselsResponse> {
    return request<ActiveVesselsResponse>("/api/v1/vessels/live");
  },

  /** Dispatch Coast Guard MRCC Intercept Notice on suspect vessel */
  dispatchVesselAlert(
    vesselId: string,
    payload: { incident_id: string; alert_type?: string; officer_notes?: string }
  ): Promise<any> {
    return request<any>(`/api/v1/vessels/${vesselId}/alert`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── Module 11: Movement Predictor ────────────

  /** Get latest oil spill movement trajectory prediction */
  getMovementPrediction(incidentId: string): Promise<MovementPredictionResponse> {
    return request<MovementPredictionResponse>(`/api/v1/incidents/${incidentId}/movement`);
  },

  /** Run or simulate a new forward movement prediction (+1h to +24h) */
  runMovementPrediction(
    incidentId: string,
    payload?: MovementPredictionRequest
  ): Promise<MovementPredictionResponse> {
    return request<MovementPredictionResponse>(`/api/v1/incidents/${incidentId}/movement/predict`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  /** Get historical prediction runs for an incident */
  getMovementHistory(incidentId: string): Promise<MovementHistoryItem[]> {
    return request<MovementHistoryItem[]>(`/api/v1/incidents/${incidentId}/movement/history`);
  },

  // ── Module 12: Marine Ecosystem Risk Analyzer ────

  /** Get the latest marine ecosystem risk assessment for an incident */
  getEcosystemRisk(incidentId: string): Promise<import('../types').EcosystemRiskResponse> {
    return request<import('../types').EcosystemRiskResponse>(`/api/v1/incidents/${incidentId}/ecosystem-risk`);
  },

  /** Run a new marine ecosystem risk analysis for an incident */
  analyzeEcosystemRisk(
    incidentId: string,
    payload?: import('../types').EcosystemAnalyzeRequest
  ): Promise<import('../types').EcosystemRiskResponse> {
    return request<import('../types').EcosystemRiskResponse>(
      `/api/v1/incidents/${incidentId}/ecosystem-risk/analyze`,
      { method: "POST", body: JSON.stringify(payload || { radius_km: 500 }) }
    );
  },

  /** Get ecosystem zones near a lat/lon point */
  getEcosystemNearbyZones(lat: number, lon: number, radiusKm?: number): Promise<unknown> {
    const r = radiusKm ?? 100;
    return request<unknown>(`/api/v1/ecosystem-zones/nearby?lat=${lat}&lon=${lon}&radius_km=${r}`);
  },

  // ── Module 13: Coastal Impact Predictor & Time-to-Impact ────

  /** Get coastal impact prediction and affected locations */
  getCoastalImpact(incidentId: string): Promise<import('../types').CoastalImpactResponse> {
    return request<import('../types').CoastalImpactResponse>(`/api/v1/incidents/${incidentId}/coastal-impact`);
  },

  /** Run or simulate new coastal impact and time-to-impact calculation */
  runCoastalImpactPredict(
    incidentId: string,
    payload?: import('../types').CoastalImpactPredictRequest
  ): Promise<import('../types').CoastalImpactResponse> {
    return request<import('../types').CoastalImpactResponse>(
      `/api/v1/incidents/${incidentId}/coastal-impact/predict`,
      { method: "POST", body: JSON.stringify(payload || {}) }
    );
  },

  /** Get concise time-to-impact metric and shoreline contact alert */
  getTimeToImpact(incidentId: string): Promise<import('../types').TimeToImpactResponse> {
    return request<import('../types').TimeToImpactResponse>(`/api/v1/incidents/${incidentId}/time-to-impact`);
  },

  // ── Module 14: Emergency Vessel Route Optimizer ────

  /** Get available response vessels across MRCC coastal stations */
  getAvailableVessels(onlyAvailable = true): Promise<AvailableVesselsResponse> {
    return request<AvailableVesselsResponse>(`/api/v1/vessels/available?only_available=${onlyAvailable}`);
  },

  /** Get ranked emergency vessel recommendations for an incident */
  getRecommendedVessels(incidentId: string): Promise<RecommendedVesselsResponse> {
    return request<RecommendedVesselsResponse>(`/api/v1/incidents/${incidentId}/recommended-vessels`);
  },

  /** Calculate and persist an optimized marine emergency response route */
  optimizeRoute(
    incidentId: string,
    payload?: RouteOptimizeRequest
  ): Promise<OptimizedRouteResponse> {
    return request<OptimizedRouteResponse>(
      `/api/v1/incidents/${incidentId}/optimize-route`,
      { method: "POST", body: JSON.stringify(payload || {}) }
    );
  },

  /** Get active optimized route for a specific vessel */
  getVesselRoute(vesselId: string): Promise<OptimizedRouteResponse> {
    return request<OptimizedRouteResponse>(`/api/v1/vessels/${vesselId}/route`);
  },

  // ── Module 15: Smart Cleanup Planner ────────────

  /** Get active cleanup plan for an incident */
  getCleanupPlan(incidentId: string): Promise<CleanupPlanResponse> {
    return request<CleanupPlanResponse>(`/api/v1/incidents/${incidentId}/cleanup-plan`);
  },

  /** Generate or re-evaluate cleanup plan */
  generateCleanupPlan(
    incidentId: string,
    payload?: CleanupPlanGenerateRequest
  ): Promise<CleanupPlanResponse> {
    return request<CleanupPlanResponse>(
      `/api/v1/incidents/${incidentId}/cleanup-plan/generate`,
      { method: "POST", body: JSON.stringify(payload || {}) }
    );
  },

  /** Accept or reject a response recommendation */
  updateRecommendationStatus(
    incidentId: string,
    recommendationId: string,
    payload: RecommendationStatusUpdateRequest
  ): Promise<CleanupRecommendationItem> {
    return request<CleanupRecommendationItem>(
      `/api/v1/incidents/${incidentId}/cleanup-plan/recommendations/${recommendationId}/status`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },

  // ── Module 16: Response Resource Allocation ─────

  /** List response resources with optional category, status, and search filters */
  getResources(params?: {
    category?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ResourceListResponse> {
    const query = new URLSearchParams();
    if (params?.category) query.append("category", params.category);
    if (params?.status) query.append("status", params.status);
    if (params?.search) query.append("search", params.search);
    if (params?.limit) query.append("limit", String(params.limit));
    if (params?.offset) query.append("offset", String(params.offset));
    const qs = query.toString();
    return request<ResourceListResponse>(`/api/v1/resources${qs ? `?${qs}` : ""}`);
  },

  /** Get quick inventory of available resources */
  getAvailableResources(category?: string): Promise<{ total_available: number; resources: ResourceItem[] }> {
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    return request<{ total_available: number; resources: ResourceItem[] }>(`/api/v1/resources/available${qs}`);
  },

  /** Get assigned resources and algorithmic recommendations for an incident */
  getIncidentResources(incidentId: string): Promise<IncidentResourcesResponse> {
    return request<IncidentResourcesResponse>(`/api/v1/incidents/${incidentId}/resources`);
  },

  /** Assign a resource to an incident with operator confirmation */
  assignResourceToIncident(
    incidentId: string,
    payload: ResourceAssignRequest
  ): Promise<ResourceAssignmentItem> {
    return request<ResourceAssignmentItem>(
      `/api/v1/incidents/${incidentId}/assign-resource`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },

  /** Update an active resource assignment status (e.g. DEPLOYED or RELEASED) */
  updateResourceAssignment(
    assignmentId: string,
    payload: AssignmentStatusUpdateRequest
  ): Promise<ResourceAssignmentItem> {
    return request<ResourceAssignmentItem>(
      `/api/v1/resource-assignments/${assignmentId}`,
      { method: "PATCH", body: JSON.stringify(payload) }
    );
  },

  /** Release a resource assignment back to AVAILABLE */
  releaseResourceAssignment(
    assignmentId: string,
    reason?: string
  ): Promise<{ success: boolean; message: string; assignment_id: string }> {
    const qs = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return request<{ success: boolean; message: string; assignment_id: string }>(
      `/api/v1/resource-assignments/${assignmentId}${qs}`,
      { method: "DELETE" }
    );
  },

  /** Update resource operational readiness/maintenance status */
  updateResourceStatus(
    resourceId: string,
    payload: ResourceStatusUpdateRequest
  ): Promise<ResourceItem> {
    return request<ResourceItem>(
      `/api/v1/resources/${resourceId}/status`,
      { method: "PATCH", body: JSON.stringify(payload) }
    );
  },

  // ── Module 17: Multi-Source Incident Verification ─────

  /** Get multi-source verification dossier for an incident */
  getIncidentVerification(incidentId: string): Promise<VerificationResponse> {
    return request<VerificationResponse>(`/api/v1/incidents/${incidentId}/verification`);
  },

  /** Trigger multi-source consensus re-evaluation */
  evaluateIncidentVerification(
    incidentId: string,
    payload?: VerificationEvaluateRequest
  ): Promise<VerificationResponse> {
    return request<VerificationResponse>(
      `/api/v1/incidents/${incidentId}/verify`,
      { method: "POST", body: JSON.stringify(payload || {}) }
    );
  },

  /** Submit new field/sensor evidence item to an incident */
  addIncidentEvidence(
    incidentId: string,
    payload: VerificationEvidenceAddRequest
  ): Promise<VerificationResponse> {
    return request<VerificationResponse>(
      `/api/v1/incidents/${incidentId}/verification/evidence`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },

  /** Commander manual verification decision override */
  overrideVerificationDecision(
    incidentId: string,
    payload: VerificationOverrideRequest
  ): Promise<VerificationResponse> {
    return request<VerificationResponse>(
      `/api/v1/incidents/${incidentId}/verification/override`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },

  // ── Module 18: Probable Spill Source Analyzer ──────────

  /** Get probable source analysis dossier for an incident */
  getSourceAnalysis(incidentId: string): Promise<SourceAnalysisResponse> {
    return request<SourceAnalysisResponse>(`/api/v1/incidents/${incidentId}/source-analysis`);
  },

  /** Evaluate / recalculate reverse-trajectory source analysis */
  evaluateSourceAnalysis(
    incidentId: string,
    payload?: SourceAnalysisRequest
  ): Promise<SourceAnalysisResponse> {
    return request<SourceAnalysisResponse>(
      `/api/v1/incidents/${incidentId}/source-analysis`,
      { method: "POST", body: JSON.stringify(payload || {}) }
    );
  },

  // ── Module 19: Citizen / Fisherman Reporting ──────────

  /** Submit citizen report with photo upload via FormData */
  submitCitizenReport(formData: FormData): Promise<CitizenReportItem> {
    return request<CitizenReportItem>("/api/v1/reports", {
      method: "POST",
      body: formData,
    });
  },

  /** Submit citizen report via JSON payload */
  submitCitizenReportJson(payload: CitizenReportCreatePayload): Promise<CitizenReportItem> {
    return request<CitizenReportItem>("/api/v1/reports/submit-json", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** List citizen reports for commander admin review */
  getCitizenReports(params?: {
    status?: string;
    category?: string;
    min_confidence?: number;
    page?: number;
    page_size?: number;
  }): Promise<CitizenReportListResponse> {
    const query = new URLSearchParams();
    if (params?.status && params.status !== "ALL") query.set("status", params.status);
    if (params?.category && params.category !== "ALL") query.set("category", params.category);
    if (params?.min_confidence !== undefined) query.set("min_confidence", String(params.min_confidence));
    if (params?.page) query.set("page", String(params.page));
    if (params?.page_size) query.set("page_size", String(params.page_size));

    const qs = query.toString() ? `?${query.toString()}` : "";
    return request<CitizenReportListResponse>(`/api/v1/reports${qs}`);
  },

  /** Retrieve single citizen report by ID */
  getCitizenReportById(id: string): Promise<CitizenReportItem> {
    return request<CitizenReportItem>(`/api/v1/reports/${id}`);
  },

  /** Transition citizen report review workflow status */
  updateCitizenReportStatus(
    id: string,
    payload: CitizenReportStatusUpdatePayload
  ): Promise<CitizenReportItem> {
    return request<CitizenReportItem>(`/api/v1/reports/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  /** Trigger AI heuristic verification and incident auto-escalation */
  verifyCitizenReport(
    id: string,
    payload?: CitizenReportVerifyPayload
  ): Promise<CitizenReportItem> {
    return request<CitizenReportItem>(`/api/v1/reports/${id}/verify`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  // ─────────────────────────────────────────────
  // Module 20: What-If Oil Spill Simulator
  // ─────────────────────────────────────────────

  /** Create a hypothetical oil spill scenario (and optionally auto-run) */
  createSimulation(payload: SimulationCreatePayload): Promise<SimulationRunItem> {
    return request<SimulationRunItem>("/api/v1/simulations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Check if a candidate coordinate is in the ocean/sea */
  validateSimulationLocation(lat: number, lon: number): Promise<{ is_water: boolean; is_land: boolean; snapped_latitude: number; snapped_longitude: number }> {
    return request<{ is_water: boolean; is_land: boolean; snapped_latitude: number; snapped_longitude: number }>(
      `/api/v1/simulations/validate-location?lat=${lat}&lon=${lon}`
    );
  },

  /** List all saved hypothetical simulation scenarios */
  getSimulations(params?: { skip?: number; limit?: number }): Promise<SimulationRunListItem[]> {
    const query = new URLSearchParams();
    if (params?.skip !== undefined) query.set("skip", String(params.skip));
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : "";
    return request<SimulationRunListItem[]>(`/api/v1/simulations${qs}`);
  },

  /** Retrieve full simulation run details, inputs, and calculated outputs */
  getSimulationById(id: string): Promise<SimulationRunItem> {
    return request<SimulationRunItem>(`/api/v1/simulations/${id}`);
  },

  /** Execute or re-compute simulation multi-domain consequences */
  runSimulation(id: string): Promise<SimulationRunItem> {
    return request<SimulationRunItem>(`/api/v1/simulations/${id}/run`, {
      method: "POST",
    });
  },

  /** Compare 2 or more simulation runs side-by-side */
  compareSimulations(ids: string[]): Promise<SimulationCompareResponse> {
    return request<SimulationCompareResponse>(`/api/v1/simulations/compare?ids=${ids.join(",")}`);
  },

  /** Delete a simulation run */
  deleteSimulation(id: string): Promise<void> {
    return request<void>(`/api/v1/simulations/${id}`, {
      method: "DELETE",
    });
  },

  // ─────────────────────────────────────────────
  // Module 21: Economic Damage Estimator
  // ─────────────────────────────────────────────

  /** Fetch latest economic impact assessment for an incident */
  getEconomicImpact(incidentId: string, currency: string = "INR"): Promise<EconomicAssessmentResponse> {
    return request<EconomicAssessmentResponse>(`/api/v1/incidents/${incidentId}/economic-impact?currency=${currency}`);
  },

  /** Calculate or re-evaluate economic impact with optional custom overrides */
  calculateEconomicImpact(
    incidentId: string,
    payload?: EconomicAssessmentRequest
  ): Promise<EconomicAssessmentResponse> {
    return request<EconomicAssessmentResponse>(`/api/v1/incidents/${incidentId}/economic-impact`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  /** Fetch past economic assessment runs for an incident */
  getEconomicHistory(incidentId: string): Promise<EconomicAssessmentResponse[]> {
    return request<EconomicAssessmentResponse[]>(`/api/v1/incidents/${incidentId}/economic-impact/history`);
  },

  /** Fetch baseline configurable economic assumptions profile */
  getEconomicAssumptions(): Promise<EconomicAssumptionData> {
    return request<EconomicAssumptionData>("/api/v1/economic-impact/assumptions");
  },

  /** Update baseline configurable economic assumptions profile */
  updateEconomicAssumptions(payload: Partial<EconomicAssumptionData>): Promise<EconomicAssumptionData> {
    return request<EconomicAssumptionData>("/api/v1/economic-impact/assumptions", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  // ─────────────────────────────────────────────
  // Module 22: Environmental Recovery Predictor
  // ─────────────────────────────────────────────

  /** Fetch latest environmental recovery assessment and trajectories for an incident */
  getEnvironmentalRecovery(incidentId: string): Promise<EnvironmentalRecoveryResponse> {
    return request<EnvironmentalRecoveryResponse>(`/api/v1/incidents/${incidentId}/recovery`);
  },

  /** Calculate or recalculate recovery trajectories across 1M, 3M, 6M, 12M, 24M */
  calculateEnvironmentalRecovery(
    incidentId: string,
    payload?: RecoveryCalculationRequest
  ): Promise<EnvironmentalRecoveryResponse> {
    return request<EnvironmentalRecoveryResponse>(`/api/v1/incidents/${incidentId}/recovery`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  /** Transition incident lifecycle status to RECOVERY and log audit event */
  transitionIncidentToRecovery(
    incidentId: string,
    payload: LifecycleTransitionRequest
  ): Promise<LifecycleTransitionResponse> {
    return request<LifecycleTransitionResponse>(`/api/v1/incidents/${incidentId}/recovery/transition-lifecycle`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Fetch baseline kinetic recovery factors across all 5 target habitats */
  getRecoveryFactors(): Promise<RecoveryFactorResponse[]> {
    return request<RecoveryFactorResponse[]>("/api/v1/recovery/factors");
  },

  // ─────────────────────────────────────────────
  // Module 23: Smart Alert and Restriction System
  // ─────────────────────────────────────────────

  /** List operational alerts with optional multi-attribute filters */
  getAlerts(params?: {
    incident_id?: string;
    status?: string;
    severity?: string;
    restriction_status?: string;
    limit?: number;
  }): Promise<AlertListResponse> {
    const query = new URLSearchParams();
    if (params?.incident_id) query.set("incident_id", params.incident_id);
    if (params?.status) query.set("status", params.status);
    if (params?.severity) query.set("severity", params.severity);
    if (params?.restriction_status) query.set("restriction_status", params.restriction_status);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : "";
    return request<AlertListResponse>(`/api/v1/alerts${qs}`);
  },

  /** Evaluate telemetry and trigger/update smart alerts for an incident */
  generateAlerts(payload: AlertGenerateRequest): Promise<SmartAlertItem[]> {
    return request<SmartAlertItem[]>("/api/v1/alerts/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Retrieve full details, recipients, and event timeline for a specific alert */
  getAlertById(id: string): Promise<SmartAlertItem> {
    return request<SmartAlertItem>(`/api/v1/alerts/${id}`);
  },

  /** Acknowledge an active alert with operator signature and optional notes */
  acknowledgeAlert(
    id: string,
    payload: AlertAcknowledgeRequest
  ): Promise<SmartAlertItem> {
    return request<SmartAlertItem>(`/api/v1/alerts/${id}/acknowledge`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  /** Formally confirm or reject a recommended operational restriction advisory */
  confirmRestriction(
    id: string,
    payload: RestrictionConfirmRequest
  ): Promise<SmartAlertItem> {
    return request<SmartAlertItem>(`/api/v1/alerts/${id}/confirm-restriction`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Fetch all configurable alerting rules and metric thresholds */
  getAlertRules(): Promise<AlertRuleItem[]> {
    return request<AlertRuleItem[]>("/api/v1/alerts/rules");
  },

  /** Modify threshold values or active status for a specific alerting rule */
  updateAlertRule(
    ruleCode: string,
    payload: AlertRuleUpdateRequest
  ): Promise<AlertRuleItem> {
    return request<AlertRuleItem>(`/api/v1/alerts/rules/${ruleCode}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  /** Fetch alerts specifically associated with an incident */
  getIncidentAlerts(
    incidentId: string,
    params?: { status?: string; severity?: string; limit?: number }
  ): Promise<AlertListResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.severity) query.set("severity", params.severity);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : "";
    return request<AlertListResponse>(`/api/v1/incidents/${incidentId}/alerts${qs}`);
  },

  // ─────────────────────────────────────────────
  // Module 24: Oil Spill AI Assistant
  // ─────────────────────────────────────────────

  /** Send a query to the Oil Spill AI Assistant with optional conversation and incident anchoring */
  askAssistant(payload: AssistantChatRequest): Promise<AssistantChatResponse> {
    return request<AssistantChatResponse>("/api/v1/assistant/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** List recent assistant conversation sessions */
  getAssistantConversations(): Promise<AssistantConversationListItem[]> {
    return request<AssistantConversationListItem[]>("/api/v1/assistant/conversations");
  },

  /** Retrieve full message history of an assistant conversation */
  getAssistantConversationById(id: string): Promise<AssistantConversationItem> {
    return request<AssistantConversationItem>(`/api/v1/assistant/conversations/${id}`);
  },

  /** Clear and delete an assistant conversation session */
  deleteAssistantConversation(id: string): Promise<{ status: string; id: string }> {
    return request<{ status: string; id: string }>(`/api/v1/assistant/conversations/${id}`, {
      method: "DELETE",
    });
  },
};

export default apiService;

