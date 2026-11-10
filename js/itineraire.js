// Calcul d'un itinéraire adapté au véhicule.
//
// 1. On calcule un trajet tenant compte de la hauteur et de la largeur du
//    véhicule (affiché tout de suite), puis un trajet « classique » (GPS ordinaire).
// 2. On cherche dans OpenStreetMap les limitations de gabarit sur ces trajets.
// 3. Tant que le trajet adapté passe par une limitation, on recalcule en lui
//    demandant d'éviter ces endroits (4 essais au maximum).
// 4. On compare avec le trajet classique pour compter les obstacles évités.
import { calculerTrajet, MAX_POINTS_EVITES, MAX_ZONES_EVITEES } from "./valhalla.js?v=0.4";
import { chercherObstaclesOSM, surLeTrajet, proches } from "./osm.js?v=0.4";
import { indexerTrajet } from "./geo.js?v=0.4";

const MAX_TOURS = 4;
const MAX_EVITEMENTS = MAX_POINTS_EVITES + MAX_ZONES_EVITEES;
const ZONE_DEPART_ARRIVEE_M = 40; // trop près du départ ou de l'arrivée : impossible à éviter

// Liste des obstacles réellement situés sur un trajet, avec le point à éviter.
function obstaclesSur(trajet, obstacles) {
  const index = indexerTrajet(trajet.points);
  const resultat = [];
  for (const o of obstacles) {
    const point = surLeTrajet(o, index);
    if (point) resultat.push({ obstacle: o, point });
  }
  return resultat;
}

// `surEtape(texte)` décrit l'avancement ; `surProvisoire(resultat)` reçoit un
// premier trajet dès qu'il est calculé, avant la vérification OpenStreetMap.
export async function calculerItineraire(depart, arrivee, profil, { surEtape = () => {}, surProvisoire = () => {} } = {}) {
  surEtape("Calcul du trajet…");
  const adapte = await calculerTrajet(depart, arrivee, profil);
  surProvisoire({ trajet: adapte, classique: null, evites: [], restants: [], verification: { enCours: true } });
  surEtape("Comparaison avec un GPS classique…");
  const classique = await calculerTrajet(depart, arrivee, null);

  // Tous les obstacles OpenStreetMap rencontrés, par identifiant.
  const connus = new Map();
  let verification = { ok: true, serveur: null };

  async function chercher(trajets) {
    try {
      const { obstacles, serveur } = await chercherObstaclesOSM(trajets.map((t) => t.points), profil);
      verification.serveur = serveur;
      for (const o of obstacles) connus.set(o.id, o);
      return true;
    } catch (erreur) {
      verification = { ok: false, erreur: String(erreur.message || erreur) };
      return false;
    }
  }

  surEtape("Recherche des limitations de hauteur, largeur et longueur…");
  await chercher([classique, adapte]);

  let trajet = adapte;
  const aEviter = []; // points [lat, lon] transmis au calculateur
  let surTrajet = obstaclesSur(trajet, connus.values());

  for (let tour = 1; tour <= MAX_TOURS && verification.ok; tour++) {
    const nouveaux = surTrajet
      .map((s) => s.point)
      .filter((p) => !proches(p, [depart.lat, depart.lon], ZONE_DEPART_ARRIVEE_M))
      .filter((p) => !proches(p, [arrivee.lat, arrivee.lon], ZONE_DEPART_ARRIVEE_M))
      .filter((p) => !aEviter.some((q) => proches(p, q, 3)));
    if (!nouveaux.length || aEviter.length >= MAX_EVITEMENTS) break;

    surEtape(`Recherche d'un trajet qui évite ${surTrajet.length > 1 ? "ces limitations" : "cette limitation"}…`);
    const essai = aEviter.concat(nouveaux).slice(0, MAX_EVITEMENTS);
    let nouveauTrajet;
    try {
      nouveauTrajet = await calculerTrajet(depart, arrivee, profil, essai);
    } catch (erreur) {
      if (erreur.code === "pas_de_chemin") break; // impossible de tout éviter : on garde le meilleur trajet trouvé
      throw erreur;
    }
    aEviter.splice(0, aEviter.length, ...essai);
    trajet = nouveauTrajet;

    surEtape("Vérification du nouveau trajet…");
    const verifie = await chercher([trajet]);
    surTrajet = obstaclesSur(trajet, connus.values());
    if (!verifie) break;
  }

  const restants = surTrajet.map((s) => s.obstacle);
  const idsRestants = new Set(restants.map((o) => o.id));
  const surClassique = obstaclesSur(classique, connus.values()).map((s) => s.obstacle);
  const evites = surClassique.filter((o) => !idsRestants.has(o.id));

  return { trajet, classique, evites, restants, verification };
}
