// Données OpenStreetMap le long d'un trajet, via le service Overpass :
// limitations de hauteur, largeur et longueur (et plus tard ralentisseurs).
import { echantillonner, distanceM } from "./geo.js?v=0.4";

// Plusieurs serveurs Overpass publics : si le premier ne répond pas, on essaie le suivant.
const SERVEURS_OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Le trajet est découpé en tronçons d'au moins 3 km ; pour chaque tronçon, on
// demande seulement les rues limitées du petit rectangle qui l'entoure. Ce type
// de recherche est très rapide pour Overpass. Au plus 60 rectangles par requête.
const LONGUEUR_TRONCON_MIN_M = 3000;
const MAX_RECTANGLES = 60;
const MARGE_DEGRES = 0.0003; // environ 30 m autour du trajet

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

// Rectangles (sud, ouest, nord, est) qui couvrent les trajets tronçon par tronçon.
function rectangles(trajets) {
  const longueurs = trajets.map((points) => {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1], points[i]);
    return total;
  });
  const longueurTroncon = Math.max(LONGUEUR_TRONCON_MIN_M, longueurs.reduce((a, b) => a + b, 0) / MAX_RECTANGLES);
  const resultat = [];
  for (const points of trajets) {
    let s = 90, o = 180, n = -90, e = -180, parcouru = 0;
    for (let i = 0; i < points.length; i++) {
      const [la, lo] = points[i];
      s = Math.min(s, la); n = Math.max(n, la); o = Math.min(o, lo); e = Math.max(e, lo);
      if (i > 0) parcouru += distanceM(points[i - 1], points[i]);
      if (parcouru >= longueurTroncon || i === points.length - 1) {
        resultat.push([s - MARGE_DEGRES, o - MARGE_DEGRES, n + MARGE_DEGRES, e + MARGE_DEGRES].map((v) => v.toFixed(4)).join(","));
        // le tronçon suivant repart du point actuel
        s = n = la; o = e = lo; parcouru = 0;
      }
    }
  }
  return [...new Set(resultat)];
}

function construireRequete(trajets) {
  const instructions = [];
  for (const r of rectangles(trajets)) {
    for (const cle of ["maxheight", "maxheight:physical", "maxwidth", "maxwidth:physical", "maxlength"]) {
      instructions.push(`way["${cle}"]["highway"](${r});`);
    }
    instructions.push(`node["maxheight"](${r});`, `node["maxwidth"](${r});`);
  }
  return `[out:json][timeout:12];(${instructions.join("")});out geom;`;
}

async function interrogerOverpass(requete) {
  let derniereErreur = null;
  for (const [rang, serveur] of SERVEURS_OVERPASS.entries()) {
    const controle = new AbortController();
    // On attend plus longtemps le serveur principal que les serveurs de secours.
    const minuteur = setTimeout(() => controle.abort(), rang === 0 ? 15000 : 10000);
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
