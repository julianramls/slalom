// Calcul d'itinéraire avec Valhalla (serveur public FOSSGIS, gratuit, sans clé).
// Règles d'usage : une requête par seconde au maximum.
import { decoderPolyligne } from "./geo.js?v=0.4";

const VALHALLA = "https://valhalla1.openstreetmap.de/route";

// Limites du serveur public : 50 points à éviter, et 100 sommets au total
// pour les zones à éviter (soit 25 petits triangles).
export const MAX_POINTS_EVITES = 50;
export const MAX_ZONES_EVITEES = 25;

let derniereRequete = 0;

async function respecterCadence() {
  const attente = derniereRequete + 1100 - Date.now();
  if (attente > 0) await new Promise((ok) => setTimeout(ok, attente));
  derniereRequete = Date.now();
}

// Petit triangle (environ 8 m) autour d'un point, au format [lon, lat].
function triangle([lat, lon]) {
  const d = 4;
  const dlat = d / 110540;
  const dlon = d / (111320 * Math.cos(lat * (Math.PI / 180)));
  return [[lon - dlon, lat - dlat], [lon + dlon, lat - dlat], [lon, lat + dlat], [lon - dlon, lat - dlat]];
}

export class ErreurItineraire extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// Calcule un trajet en voiture.
// - `gabarit` : { hauteur, largeur } en cm, ou null pour une voiture « standard » ;
// - `aEviter` : liste de points [lat, lon] dont les rues doivent être évitées.
// Renvoie { points, distanceKm, dureeS }.
export async function calculerTrajet(depart, arrivee, gabarit, aEviter = []) {
  const corps = {
    locations: [{ lat: depart.lat, lon: depart.lon }, { lat: arrivee.lat, lon: arrivee.lon }],
    costing: "auto",
    directions_type: "none",
    units: "kilometers",
  };
  if (gabarit) {
    corps.costing_options = { auto: { height: gabarit.hauteur / 100, width: gabarit.largeur / 100 } };
  }
  const points = aEviter.slice(0, MAX_POINTS_EVITES);
  const zones = aEviter.slice(MAX_POINTS_EVITES, MAX_POINTS_EVITES + MAX_ZONES_EVITEES);
  if (points.length) corps.exclude_locations = points.map(([lat, lon]) => ({ lat, lon }));
  if (zones.length) corps.exclude_polygons = zones.map(triangle);

  await respecterCadence();
  let reponse;
  try {
    reponse = await fetch(VALHALLA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
  } catch {
    throw new ErreurItineraire("Le service d'itinéraire ne répond pas. Vérifie ta connexion et réessaie.", "reseau");
  }
  const donnees = await reponse.json().catch(() => ({}));
  if (!reponse.ok || !donnees.trip) {
    const code = donnees.error_code;
    if (code === 171 || code === 170) throw new ErreurItineraire("Aucune route trouvée près du départ ou de l'arrivée.", "pas_de_route");
    if (code === 442 || code === 443) throw new ErreurItineraire("Aucun trajet possible entre ces deux points.", "pas_de_chemin");
    if (code === 154) throw new ErreurItineraire("Trajet trop long pour le service d'itinéraire gratuit.", "trop_long");
    if (reponse.status === 429) throw new ErreurItineraire("Trop de calculs d'un coup : attends quelques secondes et réessaie.", "cadence");
    throw new ErreurItineraire("Le service d'itinéraire a renvoyé une erreur" + (donnees.error ? ` : ${donnees.error}` : "."), "autre");
  }

  const formes = donnees.trip.legs.flatMap((leg, i) => {
    const pts = decoderPolyligne(leg.shape);
    return i === 0 ? pts : pts.slice(1);
  });
  return {
    points: formes,
    distanceKm: donnees.trip.summary.length,
    dureeS: donnees.trip.summary.time,
  };
}
