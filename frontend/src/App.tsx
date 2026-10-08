import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { MarineLoader } from "./components/ui/MarineLoader";
import Login from "./pages/Login";

// Citizen Portal Layout & Pages
import { CitizenLayout } from "./layouts/CitizenLayout";
import CitizenDashboard from "./pages/citizen/CitizenDashboard";
import CitizenReportPage from "./pages/citizen/CitizenReportPage";
import CitizenMyReportsPage from "./pages/citizen/CitizenMyReportsPage";
import CitizenMapPage from "./pages/citizen/CitizenMapPage";
import CitizenAlertsPage from "./pages/citizen/CitizenAlertsPage";
import CitizenProfilePage from "./pages/citizen/CitizenProfilePage";

// Admin Command Layout & Pages
import { AppLayout } from "./layouts/AppLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminCitizenReportsPage from "./pages/admin/AdminCitizenReportsPage";
import AdminAisTrackingPage from "./pages/admin/AdminAisTrackingPage";
import AdminVesselInvestigationPage from "./pages/admin/AdminVesselInvestigationPage";
import AdminHindcastingPage from "./pages/admin/AdminHindcastingPage";
import AdminDriftPage from "./pages/admin/AdminDriftPage";
import AdminAlertsPage from "./pages/admin/AdminAlertsPage";
import AdminEvidencePage from "./pages/admin/AdminEvidencePage";
import AdminUserManagementPage from "./pages/admin/AdminUserManagementPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminMarineWastePage from "./pages/admin/AdminMarineWastePage";
import DetectWaste from "./pages/DetectWaste";

// Existing Operational Tool Pages (Preserved)
import Dashboard from "./pages/Dashboard";
import Incidents from "./pages/Incidents";
import DetectSpill from "./pages/DetectSpill";
import PriorityQueue from "./pages/PriorityQueue";
import MapView from "./pages/MapView";
import RiskAnalysis from "./pages/RiskAnalysis";
import Resources from "./pages/Resources";
import CitizenReport from "./pages/CitizenReport";
import CitizenReportsAdmin from "./pages/CitizenReportsAdmin";
import Simulator from "./pages/Simulator";
import AlertsCommandCenter from "./pages/AlertsCommandCenter";
import AIAssistant from "./pages/AIAssistant";
import VoiceAssistantPage from "./pages/VoiceAssistantPage";

function RootRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#00172e] text-white">
        <MarineLoader text="Establishing Secure Marine Gateway..." />
      </div>
    );
  }
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === "citizen") {
    return <Navigate to="/citizen/dashboard" replace />;
  }
  return <Navigate to="/admin/dashboard" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Marine Surveillance Dedicated Login Page */}
            <Route path="/login" element={<Login />} />

            {/* Root Intelligent Redirection based on Role */}
            <Route path="/" element={<RootRedirect />} />

            {/* Mobile-first public standalone report route preserved */}
            <Route path="/report" element={<CitizenReport />} />

            {/* Citizen Portal (Protected for Citizens & Admins) */}
            <Route
              path="/citizen"
              element={
                <ProtectedRoute allowedRoles={["citizen", "admin"]}>
                  <CitizenLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/citizen/dashboard" replace />} />
              <Route path="dashboard" element={<CitizenDashboard />} />
              <Route path="report" element={<CitizenReportPage />} />
              <Route path="my-reports" element={<CitizenMyReportsPage />} />
              <Route path="map" element={<CitizenMapPage />} />
              <Route path="alerts" element={<CitizenAlertsPage />} />
              <Route path="profile" element={<CitizenProfilePage />} />
              <Route path="voice" element={<VoiceAssistantPage />} />
            </Route>

            {/* Admin Command Center & Operational Suite (Protected for Admins) */}
            <Route
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              {/* Admin Dedicated Command Modules */}
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/reports" element={<AdminCitizenReportsPage />} />
              <Route path="/admin/ais" element={<AdminAisTrackingPage />} />
              <Route path="/admin/investigation" element={<AdminVesselInvestigationPage />} />
              <Route path="/admin/hindcasting" element={<AdminHindcastingPage />} />
              <Route path="/admin/drift" element={<AdminDriftPage />} />
              <Route path="/admin/alerts" element={<AdminAlertsPage />} />
              <Route path="/admin/evidence" element={<AdminEvidencePage />} />
              <Route path="/admin/users" element={<AdminUserManagementPage />} />
              <Route path="/admin/settings" element={<AdminSettingsPage />} />
              <Route path="/admin/voice" element={<VoiceAssistantPage />} />

              {/* Marine Waste & Debris Module Routes */}
              <Route path="/admin/waste" element={<AdminMarineWastePage />} />
              <Route path="/waste" element={<Navigate to="/admin/waste" replace />} />
              <Route path="/detect-waste" element={<DetectWaste />} />

              {/* Existing Operational & Analytical Tools (Preserved) */}
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/incidents" element={<Incidents />} />
              <Route path="/incidents/:id" element={<Incidents />} />
              <Route path="/alerts" element={<AlertsCommandCenter />} />
              <Route path="/assistant" element={<AIAssistant />} />
              <Route path="/detect" element={<DetectSpill />} />
              <Route path="/detect-spill" element={<DetectSpill />} />
              <Route path="/priority" element={<PriorityQueue />} />
              <Route path="/map" element={<MapView />} />
              <Route path="/risk" element={<RiskAnalysis />} />
              <Route path="/resources" element={<Resources />} />
              <Route path="/reports" element={<CitizenReportsAdmin />} />
              <Route path="/simulator" element={<Simulator />} />
            </Route>

            {/* Catch-all redirect to Root */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
