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
