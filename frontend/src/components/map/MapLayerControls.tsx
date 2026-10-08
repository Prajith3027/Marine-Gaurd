import React from "react";
import {
  Flame,
  Shield,
  Fish,
  Anchor,
  Navigation,
  Globe,
  CheckSquare,
  Square,
  Maximize2,
  Compass,
  Leaf,
  Zap,
  Crosshair,
} from "lucide-react";

export interface LayerVisibility {
  incidents: boolean;
  spillPolygons: boolean;
  movementPrediction: boolean;
  ecosystemRisk: boolean;
  protectedAreas: boolean;
  fishingZones: boolean;
  ports: boolean;
  shippingLanes: boolean;
  vessels: boolean;
  coastline: boolean;
  coastalImpact: boolean;
  responseRouting: boolean;
  sourceAnalysis: boolean;
  marineWaste?: boolean;
}

interface MapLayerControlsProps {
  visibility: LayerVisibility;
  onChange: (key: keyof LayerVisibility) => void;
  counts: {
    incidents: number;
    protectedAreas: number;
    fishingZones: number;
    ports: number;
    shippingLanes: number;
    vessels?: number;
  };
  onResetView: () => void;
}

export const MapLayerControls: React.FC<MapLayerControlsProps> = ({
  visibility,
  onChange,
  counts,
  onResetView,
}) => {
  const layers: {
    key: keyof LayerVisibility;
    label: string;
    icon: React.ReactNode;
    color: string;
    count?: number;
  }[] = [
    {
      key: "incidents",
      label: "Oil Spill Incidents",
      icon: <Flame className="w-4 h-4 text-[#C6283D]" />,
      color: "text-[#C6283D]",
      count: counts.incidents,
    },
    {
      key: "movementPrediction",
      label: "Spill Movement (+24h)",
      icon: <Compass className="w-4 h-4 text-[#1268B3]" />,
      color: "text-[#1268B3]",
    },
    {
      key: "vessels",
      label: "Vessels & AIS Tracks",
      icon: <Navigation className="w-4 h-4 text-[#087F68]" />,
      color: "text-[#087F68]",
      count: counts.vessels ?? 0,
    },
    {
      key: "spillPolygons",
      label: "Spill Geometry Polygons",
      icon: <Flame className="w-4 h-4 text-[#A86A00]" />,
      color: "text-[#A86A00]",
      count: counts.incidents,
    },
    {
      key: "protectedAreas",
      label: "Protected Marine Areas",
      icon: <Shield className="w-4 h-4 text-[#087F68]" />,
      color: "text-[#087F68]",
      count: counts.protectedAreas,
    },
    {
      key: "fishingZones",
      label: "Fishing & Trawling Zones",
      icon: <Fish className="w-4 h-4 text-[#168DCC]" />,
      color: "text-[#168DCC]",
      count: counts.fishingZones,
    },
    {
      key: "ports",
      label: "Major Commercial Ports",
      icon: <Anchor className="w-4 h-4 text-[#A86A00]" />,
      color: "text-[#A86A00]",
      count: counts.ports,
    },
    {
      key: "shippingLanes",
      label: "Shipping Transit Routes",
      icon: <Navigation className="w-4 h-4 text-[#0B3A66]" />,
      color: "text-[#0B3A66]",
      count: counts.shippingLanes,
    },
    {
      key: "ecosystemRisk",
      label: "Ecosystem Risk Zones",
      icon: <Leaf className="w-4 h-4 text-[#087F68]" />,
      color: "text-[#087F68]",
    },
    {
      key: "coastalImpact",
      label: "Coastal Impact & ETA",
      icon: <Zap className="w-4 h-4 text-[#1268B3]" />,
      color: "text-[#1268B3]",
    },
    {
      key: "responseRouting",
      label: "Vessel Response Route (M14)",
      icon: <Navigation className="w-4 h-4 text-[#087F68]" />,
      color: "text-[#087F68]",
    },
    {
      key: "sourceAnalysis",
      label: "Probable Source Region (M18)",
      icon: <Crosshair className="w-4 h-4 text-[#1268B3]" />,
      color: "text-[#1268B3]",
    },
    {
      key: "coastline",
      label: "Coastal Perimeter Reference",
      icon: <Globe className="w-4 h-4 text-[#168DCC]" />,
      color: "text-[#168DCC]",
    },
    {
      key: "marineWaste",
      label: "Marine Waste & Debris (New)",
      icon: <span className="text-sm">🌊</span>,
      color: "text-emerald-500",
    },
  ];

  return (
    <div className="absolute top-6 right-6 z-[1000] bg-white/95 backdrop-blur-md border border-[#D9E8F2] rounded-xl p-3.5 shadow-xl w-64 text-[#17324D]">
      <div className="flex items-center justify-between pb-2 border-b border-[#EAF3F8]">
        <span className="text-xs font-bold uppercase tracking-wider text-[#0B3A66] flex items-center gap-1.5">
          GIS Layer Toggles
        </span>
        <button
          onClick={onResetView}
          title="Reset map view to Indian Ocean overview"
          className="text-[#5E7183] hover:text-[#1268B3] p-1 rounded hover:bg-[#F3FAFE] transition flex items-center gap-1 text-[10px] font-semibold cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>

      <div className="mt-2 space-y-1">
        {layers.map(({ key, label, icon, count }) => {
          const isActive = visibility[key];
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition duration-150 cursor-pointer ${
                isActive
                  ? "bg-[#EAF6FF] text-[#1268B3] font-bold border border-[#A9D9F5]"
                  : "text-[#5E7183] hover:bg-[#F8FCFF] hover:text-[#17324D]"
              }`}
            >
              <div className="flex items-center gap-2">
                {isActive ? (
                  <CheckSquare className="w-3.5 h-3.5 text-[#1268B3] shrink-0" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-[#8A9AA8] shrink-0" />
                )}
                <span className="shrink-0">{icon}</span>
                <span className="truncate max-w-[130px]">{label}</span>
              </div>
              {count !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-semibold ${
                    isActive
                      ? "bg-[#1268B3] text-white"
                      : "bg-[#F3FAFE] text-[#8A9AA8] border border-[#D9E8F2]"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
