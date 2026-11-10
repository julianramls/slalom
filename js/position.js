// Position du téléphone : autorisation, suivi en continu et mémorisation
// de la dernière position connue (pour rouvrir la carte au bon endroit).

const CLE_STOCKAGE = "slalom.dernierePosition";

export function lireDernierePosition() {
  try {
    const p = JSON.parse(localStorage.getItem(CLE_STOCKAGE));
    return p && typeof p.lat === "number" && typeof p.lon === "number" ? p : null;
  } catch {
    return null;
  }
}

function memoriserPosition(p) {
  try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify({ lat: p.lat, lon: p.lon })); } catch { /* sans importance */ }
}

// Renvoie "granted" (déjà autorisé), "prompt" (pas encore demandé),
// "denied" (refusé), "indisponible" ou "inconnu".
export async function etatAutorisation() {
  if (!("geolocation" in navigator)) return "indisponible";
  try {
    const resultat = await navigator.permissions.query({ name: "geolocation" });
    return resultat.state;
  } catch {
    return "inconnu";
  }
}

// Suit la position en continu. Le téléphone affiche sa demande d'autorisation
// la première fois. Renvoie une fonction qui arrête le suivi.
export function suivrePosition(surPosition, surErreur) {
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, precision: pos.coords.accuracy };
      memoriserPosition(p);
      surPosition(p);
    },
    surErreur,
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
