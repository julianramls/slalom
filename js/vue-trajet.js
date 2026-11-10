// Carte « Itinéraire » en bas de l'écran : choix du départ et de l'arrivée,
// calcul et affichage du résultat.
/* global L */
import { rechercherAdresse, adresseDuPoint } from "./geocodage.js?v=0.3";
import { calculerItineraire } from "./itineraire.js?v=0.3";
import { decrireObstacle } from "./osm.js?v=0.3";
import { lireProfil } from "./profil.js?v=0.3";
import { creerEpingle, creerCoucheTrajet } from "./carte.js?v=0.3";
import { distanceM } from "./geo.js?v=0.3";

const $ = (id) => document.getElementById(id);

export function formaterDuree(secondes) {
  const minutes = Math.max(1, Math.round(secondes / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

export function formaterDistance(km) {
  if (km < 1) return `${Math.max(10, Math.round(km * 100) * 10)} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

function pluriel(n, singulier, pluriel) {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

function element(balise, classe, texte) {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte != null) el.textContent = texte;
  return el;
}

export function initVueTrajet({ carte, obtenirPosition, ouvrirProfil }) {
  const points = { depart: null, arrivee: null };
  const champs = { depart: $("saisie-depart"), arrivee: $("saisie-arrivee") };
  const epingles = { depart: creerEpingle(carte, "depart"), arrivee: creerEpingle(carte, "arrivee") };
  const couche = creerCoucheTrajet(carte);
  const listeResultats = $("resultats");
  const boutonCalculer = $("calculer");
  const zoneEtape = $("trajet-etape");
  const zoneErreur = $("trajet-erreur");
  const zoneResultat = $("trajet-resultat");
  const zoneSaisie = $("trajet-saisie");
  const corps = $("trajet-corps");
  const poignee = $("trajet-poignee");
  const titre = $("trajet-titre");
  let calculEnCours = false;

  // ---------- Affichage ----------

  function afficherErreur(texte) {
    zoneErreur.textContent = texte;
    zoneErreur.hidden = !texte;
  }

  function afficherEtape(texte) {
    zoneEtape.textContent = texte;
    zoneEtape.hidden = !texte;
  }

  function effacerResultat() {
    couche.effacer();
    zoneResultat.hidden = true;
    zoneResultat.replaceChildren();
    zoneSaisie.hidden = false;
    titre.textContent = "Itinéraire";
    boutonCalculer.textContent = "Calculer l'itinéraire";
    afficherErreur("");
  }

  // Après un calcul, on ne montre que le résultat pour laisser de la place à la carte.
  function montrerSaisie(oui) {
    zoneSaisie.hidden = !oui;
    zoneResultat.hidden = oui;
  }

  function deplier(ouvert) {
    corps.hidden = !ouvert;
    poignee.setAttribute("aria-expanded", String(ouvert));
  }

  poignee.addEventListener("click", () => deplier(corps.hidden));

  // ---------- Départ et arrivée ----------

  function cadrerPoints() {
    const presents = [points.depart, points.arrivee].filter(Boolean);
    if (presents.length === 2) {
      carte.fitBounds(L.latLngBounds(presents.map((p) => [p.lat, p.lon])), { padding: [50, 50], maxZoom: 16 });
    } else if (presents.length === 1) {
      carte.setView([presents[0].lat, presents[0].lon], Math.max(carte.getZoom(), 15));
    }
  }

  function definirPoint(qui, point, { cadrer = true } = {}) {
    points[qui] = point;
    champs[qui].value = point ? point.nom : "";
    champs[qui].classList.toggle("ma-position", Boolean(point?.maPosition));
    // Départ « ma position » : pas d'épingle, le point bleu suffit.
    if (point && !point.maPosition) epingles[qui].placer([point.lat, point.lon]);
    else epingles[qui].retirer();
    effacerResultat();
    if (point && cadrer) cadrerPoints();
  }

  function maPosition() {
    const p = obtenirPosition();
    return p ? { nom: "📍 Ma position", lat: p.lat, lon: p.lon, maPosition: true } : null;
  }

  $("depart-ma-position").addEventListener("click", () => {
    const p = maPosition();
    if (p) definirPoint("depart", p);
    else afficherErreur("Ta position n'est pas encore connue. Touche le bouton ◎ sur la carte pour l'activer.");
  });

  $("inverser").addEventListener("click", () => {
    const { depart, arrivee } = points;
    const textes = [champs.depart.value, champs.arrivee.value];
    definirPoint("depart", arrivee, { cadrer: false });
    definirPoint("arrivee", depart, { cadrer: false });
    if (!arrivee) champs.depart.value = textes[1];
    if (!depart) champs.arrivee.value = textes[0];
  });

  // Modifier le texte annule le point choisi : il faudra relancer la recherche.
  for (const qui of ["depart", "arrivee"]) {
    champs[qui].addEventListener("input", () => {
      if (points[qui]) {
        points[qui] = null;
        epingles[qui].retirer();
        champs[qui].classList.remove("ma-position");
        effacerResultat();
      }
    });
    $("form-" + qui).addEventListener("submit", (evenement) => {
      evenement.preventDefault();
      rechercher(qui);
    });
  }

  // ---------- Recherche d'adresse ----------

  async function rechercher(qui) {
    const texte = champs[qui].value.trim();
    if (!texte) return;
    champs[qui].blur();
    afficherErreur("");
    listeResultats.replaceChildren(element("li", "resultat-info", "Recherche…"));
    listeResultats.hidden = false;

    const b = carte.getBounds();
    const zone = carte.getZoom() >= 5 ? { ouest: b.getWest(), nord: b.getNorth(), est: b.getEast(), sud: b.getSouth() } : null;
    let resultats;
    try {
      resultats = await rechercherAdresse(texte, zone);
    } catch {
      listeResultats.replaceChildren(element("li", "resultat-info", "La recherche d'adresse ne répond pas. Réessaie dans un instant."));
      return;
    }
    if (!resultats.length) {
      listeResultats.replaceChildren(element("li", "resultat-info", `Aucun résultat pour « ${texte} ». Essaie d'ajouter la ville.`));
      return;
    }
    listeResultats.replaceChildren(element("li", "resultat-titre", qui === "depart" ? "Choisis le départ :" : "Choisis l'arrivée :"));
    for (const r of resultats) {
      const li = element("li");
      const bouton = element("button", "resultat");
      bouton.type = "button";
      bouton.append(element("strong", null, r.nom), element("span", null, r.detail));
      bouton.addEventListener("click", () => {
        listeResultats.hidden = true;
        definirPoint(qui, { nom: r.nom, lat: r.lat, lon: r.lon });
      });
      li.append(bouton);
      listeResultats.append(li);
    }
  }

  // ---------- Toucher la carte ----------

  carte.on("click", (e) => {
    const { lat, lng } = e.latlng;
    const contenu = element("div", "menu-carte");
    const choix = [
      ["depart", "🟢 Partir d'ici"],
      ["arrivee", "🏁 Aller ici"],
    ];
    for (const [qui, libelle] of choix) {
      const bouton = element("button", "bouton-menu", libelle);
      bouton.type = "button";
      bouton.addEventListener("click", async () => {
        carte.closePopup();
        listeResultats.hidden = true;
        deplier(true);
        const point = { nom: "Point choisi sur la carte", lat, lon: lng };
        definirPoint(qui, point, { cadrer: false });
        const nom = await adresseDuPoint(lat, lng);
        if (nom && points[qui] === point) {
          point.nom = nom;
          champs[qui].value = nom;
        }
      });
      contenu.append(bouton);
    }
    L.popup({ closeButton: true, autoPanPadding: [20, 20] }).setLatLng(e.latlng).setContent(contenu).openOn(carte);
  });

  // ---------- Calcul ----------

  function verifierPoint(qui) {
    if (points[qui]) return true;
    const nom = qui === "depart" ? "le départ" : "l'arrivée";
    if (champs[qui].value.trim()) {
      afficherErreur(`Choisis ${nom} dans la liste des résultats.`);
      rechercher(qui);
    } else {
      afficherErreur(`Indique ${nom} : tape une adresse ou touche la carte.`);
    }
    return false;
  }

  async function calculer() {
    if (calculEnCours) return;
    afficherErreur("");
    const profil = lireProfil();
    if (!profil) {
      afficherErreur("Renseigne d'abord les mesures de ton véhicule.");
      ouvrirProfil();
      return;
    }
    if (!verifierPoint("depart") || !verifierPoint("arrivee")) return;

    let depart = points.depart;
    if (depart.maPosition) depart = maPosition() || depart; // position la plus récente
    const arrivee = points.arrivee;
    if (distanceM([depart.lat, depart.lon], [arrivee.lat, arrivee.lon]) < 30) {
      afficherErreur("Le départ et l'arrivée sont au même endroit.");
      return;
    }

    calculEnCours = true;
    boutonCalculer.disabled = true;
    boutonCalculer.textContent = "Calcul en cours…";
    listeResultats.hidden = true;
    effacerResultat();
    boutonCalculer.textContent = "Calcul en cours…";
    try {
      const resultat = await calculerItineraire(depart, arrivee, profil, afficherEtape);
      const limitesTrajet = couche.afficher(resultat, decrireObstacle);
      carte.fitBounds(limitesTrajet, { padding: [40, 40] });
      afficherResultat(resultat, profil, depart, arrivee);
      boutonCalculer.textContent = "Recalculer";
      montrerSaisie(false);
    } catch (erreur) {
      afficherErreur(erreur.message || "Le calcul a échoué. Réessaie dans un instant.");
      boutonCalculer.textContent = "Calculer l'itinéraire";
    } finally {
      afficherEtape("");
      calculEnCours = false;
      boutonCalculer.disabled = false;
    }
  }

  boutonCalculer.addEventListener("click", calculer);

  function afficherResultat({ trajet, classique, evites, restants, verification }, profil, depart, arrivee) {
    const resume = `${formaterDuree(trajet.dureeS)} · ${formaterDistance(trajet.distanceKm)}`;
    titre.textContent = "Itinéraire : " + resume;

    const blocs = [element("p", "resultat-chiffres", resume)];
    const etapes = element("p", "resultat-etapes");
    etapes.append(element("span", "pastille depart", "D"), element("span", null, depart.nom), element("span", "pastille arrivee", "A"), element("span", null, arrivee.nom));
    blocs.push(etapes);
    blocs.push(element("p", "resultat-ligne", `Adapté à ton véhicule : ${profil.hauteur} cm de haut, ${profil.largeur} cm de large, ${profil.longueur} cm de long.`));

    if (verification.ok) {
      if (evites.length) {
        blocs.push(element("p", "resultat-ligne ok", `✓ ${pluriel(evites.length, "limitation de gabarit évitée", "limitations de gabarit évitées")} par rapport à un GPS classique.`));
      } else {
        blocs.push(element("p", "resultat-ligne ok", "✓ Aucune limitation de gabarit connue sur ce trajet."));
      }
    } else {
      blocs.push(element("p", "resultat-ligne attention",
        "⚠️ La vérification dans OpenStreetMap n'a pas pu se faire (service occupé). Seules les limites de hauteur et de largeur connues du calculateur sont prises en compte. Réessaie dans quelques minutes."));
    }

    if (restants.length) {
      blocs.push(element("p", "resultat-ligne attention", `⚠️ ${pluriel(restants.length, "limitation impossible à éviter", "limitations impossibles à éviter")} :`));
      const liste = element("ul", "resultat-liste");
      for (const o of restants) liste.append(element("li", null, decrireObstacle(o)));
      blocs.push(liste);
    }

    const ecart = Math.abs(classique.distanceKm - trajet.distanceKm);
    if (ecart > 0.05 || Math.abs(classique.dureeS - trajet.dureeS) > 30) {
      blocs.push(element("p", "resultat-ligne discret",
        `Un GPS classique ferait ${formaterDuree(classique.dureeS)} · ${formaterDistance(classique.distanceKm)} (en pointillés gris sur la carte).`));
    } else {
      blocs.push(element("p", "resultat-ligne discret", "C'est le même trajet qu'un GPS classique."));
    }
    if (verification.ok && verification.serveur) {
      blocs.push(element("p", "resultat-source", `Données vérifiées dans OpenStreetMap (${verification.serveur}).`));
    }

    const boutons = element("div", "rangee-boutons");
    const modifier = element("button", "bouton-secondaire", "✏️ Modifier");
    modifier.type = "button";
    modifier.addEventListener("click", () => montrerSaisie(true));
    const effacer = element("button", "bouton-secondaire", "✕ Effacer");
    effacer.type = "button";
    effacer.addEventListener("click", () => {
      definirPoint("arrivee", null, { cadrer: false });
      effacerResultat();
    });
    boutons.append(modifier, effacer);
    blocs.push(boutons);

    zoneResultat.replaceChildren(...blocs);
    zoneResultat.hidden = false;
  }

  return {
    // Appelé quand la position est connue pour la première fois :
    // le départ par défaut devient « ma position ».
    positionDisponible() {
      if (!points.depart && !champs.depart.value.trim()) {
        definirPoint("depart", maPosition(), { cadrer: false });
      }
    },
  };
}
