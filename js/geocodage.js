// Recherche d'adresses avec Nominatim (OpenStreetMap), dans le monde entier.
// Règles d'usage de Nominatim : une recherche à la fois, pas de recherche
// automatique pendant la frappe. On cherche donc seulement quand on valide.

const NOMINATIM = "https://nominatim.openstreetmap.org";

// Version courte d'une adresse : « Gare de Lyon, 4 Rue Van Gogh, Paris ».
function nomCourt(resultat) {
  const a = resultat.address || {};
  const rue = a.road ? [a.house_number, a.road].filter(Boolean).join(" ") : null;
  const ville = a.city || a.town || a.village || a.municipality || a.hamlet || a.county || a.state;
  const morceaux = [];
  for (const m of [resultat.name, rue, ville]) {
    if (m && !morceaux.includes(m)) morceaux.push(m);
  }
  if (morceaux.length) return morceaux.join(", ");
  return (resultat.display_name || "").split(",").slice(0, 3).map((m) => m.trim()).join(", ");
}

async function appeler(chemin, parametres) {
  const p = new URLSearchParams({ format: "jsonv2", "accept-language": "fr", addressdetails: "1", ...parametres });
  const reponse = await fetch(`${NOMINATIM}/${chemin}?${p}`);
  if (!reponse.ok) throw new Error("Nominatim a répondu " + reponse.status);
  return reponse.json();
}

// Cherche une adresse ou un lieu. `zone` (facultatif) favorise les résultats
// proches de la partie de carte affichée, sans exclure le reste du monde.
export async function rechercherAdresse(texte, zone) {
  const parametres = { q: texte, limit: "5" };
  if (zone) parametres.viewbox = [zone.ouest, zone.nord, zone.est, zone.sud].map((v) => v.toFixed(4)).join(",");
  const resultats = await appeler("search", parametres);
  return resultats.map((r) => ({
    nom: nomCourt(r),
    detail: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
  }));
}

// Nom de l'endroit touché sur la carte (adresse la plus proche).
export async function adresseDuPoint(lat, lon) {
  try {
    const r = await appeler("reverse", { lat: String(lat), lon: String(lon), zoom: "18" });
    return r && !r.error ? nomCourt(r) : null;
  } catch {
    return null;
  }
}
