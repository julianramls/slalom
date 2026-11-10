# Slalom

Prototype d'application web de navigation pour les voitures basses, larges ou longues.

L'application fonctionne directement dans le navigateur du téléphone et est publiée
gratuitement avec GitHub Pages.

## Avancement

- [x] Étape 0 : mise en ligne
- [x] Étape 1 : profil du véhicule
- [x] Étape 2 : carte centrée sur ma position
- [ ] Étape 3 : itinéraire (évite les rues trop basses, étroites ou limitées en longueur)
- [ ] Étape 4 : évitement des ralentisseurs selon la garde au sol
- [ ] Étape 5 : signalement d'obstacles
- [ ] Étape 6 : bilan du trajet et finitions

## Services utilisés (gratuits, sans clé)

- Carte : OpenStreetMap, affichée avec la bibliothèque Leaflet 1.9.4 (copiée dans `lib/leaflet`, licence BSD-2)
- Itinéraires : Valhalla (serveur public FOSSGIS)
- Recherche d'adresses : Nominatim (OpenStreetMap)
- Ralentisseurs et limitations : Overpass API (données OpenStreetMap)
