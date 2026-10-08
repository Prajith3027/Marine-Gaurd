/**
 * Coastal Boundary Geometry & Water Area Validation Utility.
 * Fast client-side point-in-water validation for marine simulations.
 */

export const INDIA_COASTLINE: [number, number][] = [
  // Gujarat & Gulf of Kutch
  [23.700, 68.500],
  [23.000, 69.500],
  [22.833, 69.355], // Mandvi
  [23.013, 70.220], // Kandla Port
  [22.800, 70.200],
  [22.300, 69.000], // Dwarka Outer
  [21.600, 69.600], // Porbandar
  [21.000, 70.000], // Veraval
  [20.700, 70.900], // Diu
  [20.800, 71.500],
  [21.200, 72.800], // Surat
  [20.500, 72.800], // Daman
  // Maharashtra & Konkan Coast
  [19.800, 72.700],
  [19.135, 72.812], // Versova / Juhu
  [19.098, 72.826], // Juhu Beach
  [18.949, 72.951], // JNPT Mumbai
  [18.900, 72.800], // Colaba / Mumbai Port
  [18.300, 72.900], // Alibaug
  [17.500, 73.200], // Ratnagiri
  [16.050, 73.460], // Malvan Marine Sanctuary
  [15.544, 73.755], // Calangute / Goa
  [15.416, 73.803], // Mormugao Port
  // Karnataka & Kerala (Malabar Coast)
  [14.800, 74.100], // Karwar
  [14.200, 74.500], // Honnavar
  [13.300, 74.700], // Malpe
  [12.800, 74.800], // Mangalore
  [11.900, 75.300], // Kannur
  [11.250, 75.770], // Kozhikode
  [10.500, 76.000], // Ponnani
  [9.967, 76.271],  // Cochin Port
  [9.500, 76.300],  // Alappuzha
  [8.880, 76.580],  // Kollam
  [8.402, 76.978],  // Kovalam Kerala
  [8.172, 77.712],  // Kudankulam
  [8.080, 77.550],  // Kanyakumari (Cape Comorin)
  // Tamil Nadu (Coromandel Coast, Gulf of Mannar & Palk Bay)
  [8.754, 78.196],  // Tuticorin Port
  [9.050, 78.800],  // Gulf of Mannar Reserve
  [9.280, 79.120],  // Gulf of Mannar Coral Reef
  [9.280, 79.310],  // Mandapam / Rameswaram
  [9.500, 79.250],  // Palk Bay
  [9.750, 79.200],  // Palk Bay Seagrass Beds
  [10.300, 79.850], // Point Calimere
  [10.770, 79.850], // Nagapattinam
  [11.150, 79.850], // Karaikal
  [11.750, 79.770], // Cuddalore
  [11.930, 79.830], // Pondicherry
  [12.616, 80.198], // Mahabalipuram
  [12.788, 80.252], // Kovalam Marine Biodiversity
  [12.816, 80.245], // Muttukadu
  [12.999, 80.272], // Besant Nagar Beach
  [13.050, 80.282], // Chennai Marina Beach
  [13.084, 80.297], // Chennai Port
  [13.125, 80.298], // Kasimedu Fishermen Wharf
  [13.235, 80.325], // Ennore Creek
  [13.250, 80.339], // Kamarajar Port
  [13.418, 80.320], // Pulicat Lagoon
  // Andhra Pradesh
  [14.250, 80.150], // Krishnapatnam Port
  [15.000, 80.200], // Ongole
  [15.800, 80.400], // Bapatla
  [16.150, 81.150], // Machilipatnam
  [16.800, 82.350], // Kakinada
  [17.690, 83.298], // Visakhapatnam Port
  [18.300, 84.000], // Srikakulam
  // Odisha & West Bengal
  [19.200, 84.900], // Gopalpur
  [19.720, 85.300], // Chilika Lake
  [19.798, 85.825], // Puri Golden Beach
  [20.264, 86.671], // Paradip Port
  [20.800, 86.900], // Dhamra
  [21.500, 87.200], // Chandipur
  [21.620, 87.520], // Digha
  [21.800, 88.000], // Haldia / Sagar Island
  [21.600, 88.250], // Sandheads
  [21.940, 89.180], // Sundarbans
  [22.000, 89.000]  // Bengal Delta
];

const INDIA_LAND_POLYGON: [number, number][] = [
  ...INDIA_COASTLINE,
  [26.000, 89.000],
  [28.000, 85.000],
  [30.000, 78.000],
  [28.000, 72.000],
  [25.000, 68.500],
  [23.700, 68.500]
];

const SRI_LANKA_POLYGON: [number, number][] = [
  [9.800, 79.800],
  [9.800, 80.300],
  [8.600, 81.300],
  [7.300, 81.900],
  [6.000, 81.300],
  [5.900, 80.500],
  [6.900, 79.800],
  [8.000, 79.700]
];

function isPointInPolygon(lat: number, lon: number, polygon: [number, number][]): boolean {
  const n = polygon.length;
  let inside = false;
  let [p1Lat, p1Lon] = polygon[0];
  for (let i = 1; i <= n; i++) {
    const [p2Lat, p2Lon] = polygon[i % n];
    if (Math.min(p1Lat, p2Lat) < lat && lat <= Math.max(p1Lat, p2Lat)) {
      if (lon <= Math.max(p1Lon, p2Lon)) {
        if (p1Lat !== p2Lat) {
          const xInters = ((lat - p1Lat) * (p2Lon - p1Lon)) / (p2Lat - p1Lat) + p1Lon;
          if (p1Lon === p2Lon || lon <= xInters) {
            inside = !inside;
          }
        }
      }
    }
    p1Lat = p2Lat;
    p1Lon = p2Lon;
  }
  return inside;
}

/**
 * Returns true if the coordinate is in the ocean/sea area (not on peninsular India or Sri Lanka landmass).
 */
export function isWaterCoordinate(lat: number, lon: number): boolean {
  const onMainland = isPointInPolygon(lat, lon, INDIA_LAND_POLYGON);
  const onSriLanka = isPointInPolygon(lat, lon, SRI_LANKA_POLYGON);
  return !onMainland && !onSriLanka;
}
