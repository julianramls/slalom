// Outils de géométrie : décodage des trajets, distances, simplification
// et recherche rapide des points proches d'un trajet.

// Décode une ligne au format « polyline » (précision 6) renvoyée par Valhalla.
// Renvoie une liste de [latitude, longitude].
export function decoderPolyligne(texte, precision = 6) {
  const facteur = 10 ** precision;
  const points = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < texte.length) {
    for (let coord = 0; coord < 2; coord++) {
      let decalage = 0;
      let resultat = 0;
      let octet;
      do {
        octet = texte.charCodeAt(index++) - 63;
        resultat |= (octet & 0x1f) << decalage;
        decalage += 5;
      } while (octet >= 0x20);
      const delta = resultat & 1 ? ~(resultat >> 1) : resultat >> 1;
      if (coord === 0) lat += delta;
      else lon += delta;
    }
    points.push([lat / facteur, lon / facteur]);
  }
  return points;
}

// Distance approximative en mètres entre deux points [lat, lon].
export function distanceM(a, b) {
  const kx = 111320 * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  return Math.hypot((b[1] - a[1]) * kx, (b[0] - a[0]) * 110540);
}

// Projection locale en mètres autour d'un point de référence (suffisante
// pour mesurer des écarts de quelques mètres le long d'un trajet).
export function creerProjection(lat0, lon0) {
  const kx = 111320 * Math.cos(lat0 * (Math.PI / 180));
  const ky = 110540;
  return {
    versXY: (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky],
    versLatLon: (x, y) => [lat0 + y / ky, lon0 + x / kx],
  };
}

// Simplifie une ligne (algorithme de Douglas-Peucker) : enlève les points
// qui s'écartent de moins de `toleranceM` mètres de la ligne simplifiée.
export function simplifier(points, toleranceM) {
  if (points.length <= 2) return points.slice();
  const proj = creerProjection(points[0][0], points[0][1]);
  const xy = points.map(([la, lo]) => proj.versXY(la, lo));
  const garder = new Uint8Array(points.length);
  garder[0] = 1;
  garder[points.length - 1] = 1;
  const pile = [[0, points.length - 1]];
  while (pile.length) {
    const [debut, fin] = pile.pop();
    let pire = -1;
    let ecartMax = 0;
    for (let i = debut + 1; i < fin; i++) {
      const e = distancePointSegment(xy[i], xy[debut], xy[fin]).distance;
      if (e > ecartMax) { ecartMax = e; pire = i; }
    }
    if (ecartMax > toleranceM && pire > 0) {
      garder[pire] = 1;
      pile.push([debut, pire], [pire, fin]);
    }
  }
  return points.filter((_, i) => garder[i]);
}

// Distance d'un point P à un segment AB (coordonnées en mètres).
function distancePointSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx;
  const y = a[1] + t * dy;
  return { distance: Math.hypot(p[0] - x, p[1] - y), x, y };
}

const TAILLE_CASE = 25; // mètres

// Prépare un trajet pour savoir très vite si un point en est proche.
export function indexerTrajet(points) {
  const proj = creerProjection(points[0][0], points[0][1]);
  const xy = points.map(([la, lo]) => proj.versXY(la, lo));
  const cases = new Map();
  const cle = (cx, cy) => cx + ":" + cy;

  for (let i = 0; i < xy.length - 1; i++) {
    const [ax, ay] = xy[i];
    const [bx, by] = xy[i + 1];
    const x1 = Math.floor((Math.min(ax, bx) - TAILLE_CASE) / TAILLE_CASE);
    const x2 = Math.floor((Math.max(ax, bx) + TAILLE_CASE) / TAILLE_CASE);
    const y1 = Math.floor((Math.min(ay, by) - TAILLE_CASE) / TAILLE_CASE);
    const y2 = Math.floor((Math.max(ay, by) + TAILLE_CASE) / TAILLE_CASE);
    for (let cx = x1; cx <= x2; cx++) {
      for (let cy = y1; cy <= y2; cy++) {
        const k = cle(cx, cy);
        if (!cases.has(k)) cases.set(k, []);
        cases.get(k).push(i);
      }
    }
  }

  return {
    // Segment du trajet le plus proche d'un point, s'il est à moins de
    // `rayonM` mètres (rayon de 25 m au maximum). Renvoie aussi la
    // direction du segment, pour comparer avec celle d'une rue.
    plusProche(lat, lon, rayonM) {
      const p = proj.versXY(lat, lon);
      const candidats = cases.get(cle(Math.floor(p[0] / TAILLE_CASE), Math.floor(p[1] / TAILLE_CASE)));
      if (!candidats) return null;
      let meilleur = null;
      for (const i of candidats) {
        const r = distancePointSegment(p, xy[i], xy[i + 1]);
        if (r.distance <= rayonM && (!meilleur || r.distance < meilleur.distance)) {
          const dx = xy[i + 1][0] - xy[i][0];
          const dy = xy[i + 1][1] - xy[i][1];
          const n = Math.hypot(dx, dy) || 1;
          meilleur = { distance: r.distance, segment: i, direction: [dx / n, dy / n] };
        }
      }
      return meilleur;
    },
    versXY: proj.versXY,
  };
}

// Points régulièrement espacés (tous les `pasM` mètres) le long d'une ligne,
// avec la direction locale de la ligne en chaque point.
export function echantillonner(points, pasM) {
  const proj = creerProjection(points[0][0], points[0][1]);
  const xy = points.map(([la, lo]) => proj.versXY(la, lo));
  const resultat = [];
  for (let i = 0; i < xy.length - 1; i++) {
    const [ax, ay] = xy[i];
    const [bx, by] = xy[i + 1];
    const longueur = Math.hypot(bx - ax, by - ay);
    if (!longueur) continue;
    const direction = [(bx - ax) / longueur, (by - ay) / longueur];
    const nb = Math.max(1, Math.round(longueur / pasM));
    for (let k = 0; k < nb; k++) {
      const t = (k + 0.5) / nb;
      resultat.push({ position: proj.versLatLon(ax + t * (bx - ax), ay + t * (by - ay)), direction, longueur: longueur / nb });
    }
  }
  return resultat;
}

// Rectangle englobant une liste de points : [[sud, ouest], [nord, est]].
export function limites(points) {
  let s = 90, o = 180, n = -90, e = -180;
  for (const [la, lo] of points) {
    s = Math.min(s, la); n = Math.max(n, la);
    o = Math.min(o, lo); e = Math.max(e, lo);
  }
  return [[s, o], [n, e]];
}
