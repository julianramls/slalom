# Slalom

Prototype d'application web de navigation pour les voitures basses, larges ou longues.

L'application fonctionne directement dans le navigateur du téléphone et est publiée
gratuitement avec GitHub Pages.

## Avancement

- [x] Étape 0 : mise en ligne
- [x] Étape 1 : profil du véhicule
- [x] Étape 2 : carte centrée sur ma position
- [x] Étape 3 : itinéraire (évite les rues trop basses, étroites ou limitées en longueur)
- [ ] Étape 4 : évitement des ralentisseurs selon la garde au sol
- [ ] Étape 5 : signalement d'obstacles
- [ ] Étape 6 : bilan du trajet et finitions

## Services utilisés (gratuits, sans clé)

- Carte : OpenStreetMap, affichée avec la bibliothèque Leaflet 1.9.4 (copiée dans `lib/leaflet`, licence BSD-2)
- Itinéraires : Valhalla (serveur public FOSSGIS)
- Recherche d'adresses : Nominatim (OpenStreetMap)
- Ralentisseurs et limitations : Overpass API (données OpenStreetMap)

## Comment l'itinéraire est calculé

1. Valhalla calcule un trajet « classique » et un trajet qui tient compte de la
   hauteur et de la largeur du véhicule.
2. Overpass cherche dans OpenStreetMap les limitations de hauteur, largeur et
   longueur (`maxheight`, `maxwidth`, `maxlength`) le long de ces trajets.
3. Tant que le trajet passe par une limitation trop basse, étroite ou courte,
   Valhalla recalcule en évitant ces endroits (4 essais au maximum, 75 endroits
   évités au maximum : limites du serveur public).
4. Les obstacles du trajet classique absents du trajet final sont comptés comme
   « évités ».
