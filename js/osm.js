// Données OpenStreetMap le long d'un trajet, via le service Overpass :
// limitations de hauteur, largeur et longueur (et plus tard ralentisseurs).
import { simplifier, echantillonner, distanceM } from "./geo.js?v=0.3";

// Plusieurs serveurs Overpass publics : si le premier ne répond pas, on essaie le suivant.
const SERVEURS_OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Taille des morceaux de trajet envoyés à Overpass (les longs trajets sont
// découpés en plusieurs morceaux pour garder une recherche précise).
const POINTS_PAR_MORCEAU = 250;
const MAX_POINTS_TOTAL = 1000;

// Lit une limite OpenStreetMap (« 3.5 », « 3,5 m », « 11'6" », « 12 ft »…)
// et la renvoie en mètres. Renvoie null si la valeur n'est pas un nombre
// (« default », « none », « below_default »…).
export function lireMetres(valeur) {
  if (valeur == null) return null;
  const t = String(valeur).trim().toLowerCase().replace(",", ".");
  let m = t.match(/^(\d+(?:\.\d+)?)\s*(?:m|mètres?|metres?)?$/);
  if (m) return parseFloat(m[1]);
  m = t.match(/^(\d+(?:\.\d+)?)\s*cm$/);
  if (m) return parseFloat(m[1]) / 100;
  m = t.match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet|')\s*(?:(\d+(?:\.\d+)?)\s*(?:"|''|in|inch|inches)?)?$/);
  if (m) return parseFloat(m[1]) * 0.3048 + (m[2] ? parseFloat(m[2]) * 0.0254 : 0);
  return null;
}

// Plus petite limite trouvée parmi plusieurs étiquettes OpenStreetMap.
function limiteMin(tags, cles) {
  let min = null;
  for (const cle of cles) {
    const v = lireMetres(tags[cle]);
    if (v != null && v > 0 && (min == null || v < min)) min = v;
  }
  return min;
}

const DIMENSIONS = [
  { type: "hauteur",  cles: ["maxheight", "maxheight:physical"], profil: "hauteur" },
  { type: "largeur",  cles: ["maxwidth", "maxwidth:physical"],   profil: "largeur" },
  { type: "longueur", cles: ["maxlength"],                       profil: "longueur" },
];

// Limitations de gabarit qui interdisent le passage à ce véhicule.
function limitationsBloquantes(tags, profil) {
  const resultat = [];
  for (const d of DIMENSIONS) {
    const limite = limiteMin(tags, d.cles);
    if (limite != null && profil[d.profil] / 100 > limite) {
      resultat.push({ type: d.type, limite });
    }
  }
  return resultat;
}

// Ligne simplifiée (au plus MAX_POINTS_TOTAL points), découpée en morceaux.
function morceauxSimplifies(points) {
  let tolerance = 4;
  let ligne = simplifier(points, tolerance);
  while (ligne.length > MAX_POINTS_TOTAL) {
    tolerance *= 2;
    ligne = simplifier(points, tolerance);
  }
  const morceaux = [];
  for (let i = 0; i < ligne.length - 1; i += POINTS_PAR_MORCEAU - 1) {
    morceaux.push(ligne.slice(i, i + POINTS_PAR_MORCEAU));
  }
  return { morceaux, tolerance };
}

function construireRequete(trajets) {
  const instructions = [];
  for (const points of trajets) {
    const { morceaux, tolerance } = morceauxSimplifies(points);
    const rayon = Math.ceil(tolerance + 8);
    for (const morceau of morceaux) {
      const coords = morceau.map(([la, lo]) => la.toFixed(5) + "," + lo.toFixed(5)).join(",");
      const autour = `around:${rayon},${coords}`;
      instructions.push(`way(${autour})["highway"][~"^max(height|width|length)(:physical)?$"~"."];`);
      instructions.push(`node(${autour})[~"^max(height|width)(:physical)?$"~"."];`);
    }
  }
  return `[out:json][timeout:18];(${instructions.join("")});out geom;`;
}

async function interrogerOverpass(requete) {
  let derniereErreur = null;
  for (const [rang, serveur] of SERVEURS_OVERPASS.entries()) {
    const controle = new AbortController();
    // On attend plus longtemps le serveur principal que les serveurs de secours.
    const minuteur = setTimeout(() => controle.abort(), rang === 0 ? 20000 : 12000);
    try {
      const reponse = await fetch(serveur, {
        method: "POST",
        body: "data=" + encodeURIComponent(requete),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controle.signal,
      });
      if (!reponse.ok) throw new Error("Overpass a répondu " + reponse.status);
      const donnees = await reponse.json();
      // Overpass peut répondre « 200 » avec une erreur dans « remark » (délai dépassé…).
      if (donnees.remark && /error|timed out/i.test(donnees.remark)) throw new Error(donnees.remark);
      return { elements: donnees.elements || [], serveur: new URL(serveur).hostname };
    } catch (erreur) {
      derniereErreur = erreur;
    } finally {
      clearTimeout(minuteur);
    }
  }
  throw derniereErreur || new Error("Overpass indisponible");
}

// Transforme la réponse Overpass en « obstacles » qui gênent ce véhicule.
function lireObstacles(elements, profil) {
  const obstacles = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const bloquantes = limitationsBloquantes(tags, profil);
    if (!bloquantes.length) continue;
    const base = {
      id: el.type + "/" + el.id,
      nom: tags.name || tags.ref || null,
      limitations: bloquantes,
    };
    if (el.type === "way" && el.geometry?.length >= 2) {
      obstacles.push({ ...base, forme: "rue", geometrie: el.geometry.map((g) => [g.lat, g.lon]) });
    } else if (el.type === "node") {
      obstacles.push({ ...base, forme: "point", position: [el.lat, el.lon] });
    }
  }
  return obstacles;
}

// Recherche les obstacles OpenStreetMap autour d'un ou plusieurs trajets.
// Renvoie { obstacles, serveur }. Lance une erreur si Overpass est injoignable.
export async function chercherObstaclesOSM(trajets, profil) {
  const { elements, serveur } = await interrogerOverpass(construireRequete(trajets));
  return { obstacles: lireObstacles(elements, profil), serveur };
}

// Vérifie si un obstacle se trouve réellement SUR le trajet (et pas sur une
// rue qui le croise ou passe dessous). Renvoie le point du trajet à éviter,
// ou null si l'obstacle n'est pas sur le trajet.
export function surLeTrajet(obstacle, index) {
  if (obstacle.forme === "point") {
    const proche = index.plusProche(obstacle.position[0], obstacle.position[1], 6);
    return proche ? obstacle.position : null;
  }

  // Rue : on mesure sur quelle longueur elle suit le trajet, dans le même sens.
  const echantillons = echantillonner(obstacle.geometrie, 3);
  let longueurRue = 0;
  const communs = [];
  for (const e of echantillons) {
    longueurRue += e.longueur;
    const proche = index.plusProche(e.position[0], e.position[1], 4);
    if (!proche) continue;
    const [rx, ry] = proche.direction;
    const alignement = Math.abs(rx * e.direction[0] + ry * e.direction[1]);
    if (alignement > 0.87) communs.push(e); // moins de 30° d'écart
  }
  const longueurCommune = communs.reduce((somme, e) => somme + e.longueur, 0);
  if (longueurCommune >= Math.min(20, 0.6 * longueurRue) && longueurCommune > 2) {
    return communs[Math.floor(communs.length / 2)].position;
  }
  return null;
}

// Description lisible d'un obstacle : « hauteur limitée à 1,90 m (Rue X) ».
export function decrireObstacle(obstacle) {
  const textes = obstacle.limitations.map((l) => `${l.type} limitée à ${l.limite.toFixed(2).replace(".", ",")} m`);
  let texte = textes.join(", ");
  texte = texte.charAt(0).toUpperCase() + texte.slice(1);
  return obstacle.nom ? `${texte} (${obstacle.nom})` : texte;
}

// Vrai si deux points sont à moins de `metres` l'un de l'autre.
export function proches(a, b, metres) {
  return distanceM(a, b) < metres;
}
