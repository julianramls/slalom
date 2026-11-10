// Carte OpenStreetMap (bibliothèque Leaflet, chargée dans index.html).
/* global L */

// Crée la carte. Sans position connue, elle montre le monde entier.
export function creerCarte(idElement, positionDepart) {
  const carte = L.map(idElement, { zoomControl: false });
  L.control.zoom({ position: "bottomleft", zoomInTitle: "Zoomer", zoomOutTitle: "Dézoomer" }).addTo(carte);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>',
  }).addTo(carte);

  if (positionDepart) carte.setView([positionDepart.lat, positionDepart.lon], 15);
  else carte.setView([30, 0], 2);
  return carte;
}

// Point bleu « je suis ici », entouré d'un cercle qui montre la précision.
export function creerMarqueurPosition(carte) {
  let point = null;
  let cercle = null;
  return {
    mettreAJour(p) {
      const ll = [p.lat, p.lon];
      if (!point) {
        cercle = L.circle(ll, { radius: p.precision, color: "#1a73e8", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(carte);
        point = L.marker(ll, {
          icon: L.divIcon({ className: "", html: '<div class="ma-position"></div>', iconSize: [20, 20] }),
          interactive: false,
          keyboard: false,
        }).addTo(carte);
      } else {
        point.setLatLng(ll);
        cercle.setLatLng(ll).setRadius(p.precision);
      }
    },
  };
}

// Épingle « D » (départ) ou « A » (arrivée).
export function creerEpingle(carte, type) {
  let marqueur = null;
  const icone = L.divIcon({
    className: "",
    html: `<div class="epingle ${type}"><span>${type === "depart" ? "D" : "A"}</span></div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
  });
  return {
    placer(position) {
      if (marqueur) marqueur.setLatLng(position);
      else marqueur = L.marker(position, { icon: icone, keyboard: false, zIndexOffset: 500 }).addTo(carte);
    },
    retirer() {
      if (marqueur) marqueur.remove();
      marqueur = null;
    },
  };
}

// Trajet dessiné sur la carte, avec le trajet « classique » en pointillés
// et les obstacles évités ou restants.
export function creerCoucheTrajet(carte) {
  const groupe = L.layerGroup().addTo(carte);

  // Le texte vient d'OpenStreetMap (noms de rues) : on l'insère comme du texte, jamais comme du HTML.
  function marqueObstacle(position, classe, symbole, description, conclusion) {
    const contenu = document.createElement("div");
    const ligne1 = document.createElement("div");
    ligne1.textContent = description;
    const ligne2 = document.createElement("strong");
    ligne2.textContent = conclusion;
    contenu.append(ligne1, ligne2);
    L.marker(position, {
      icon: L.divIcon({ className: "", html: `<div class="marque-obstacle ${classe}">${symbole}</div>`, iconSize: [26, 26] }),
      keyboard: false,
    }).bindPopup(contenu).addTo(groupe);
  }

  return {
    afficher({ trajet, classique, evites, restants }, decrire) {
      groupe.clearLayers();
      if (classique) {
        L.polyline(classique.points, { color: "#6b7280", weight: 4, opacity: 0.8, dashArray: "6 8", interactive: false }).addTo(groupe);
      }
      L.polyline(trajet.points, { color: "#ffffff", weight: 9, opacity: 0.9, interactive: false }).addTo(groupe);
      const ligne = L.polyline(trajet.points, { color: "#0b5cad", weight: 6, opacity: 0.95, interactive: false }).addTo(groupe);
      for (const o of evites) marqueObstacle(positionObstacle(o), "evite", "⛔", decrire(o), "Évité grâce à Slalom.");
      for (const o of restants) marqueObstacle(positionObstacle(o), "reste", "!", decrire(o), "Sur ton trajet : impossible à éviter.");
      return ligne.getBounds();
    },
    effacer() {
      groupe.clearLayers();
    },
  };
}

function positionObstacle(o) {
  if (o.forme === "point") return o.position;
  return o.geometrie[Math.floor(o.geometrie.length / 2)];
}
