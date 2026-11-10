// Slalom : application de navigation pour voitures basses, larges ou longues.
import { initVueProfil } from "./vue-profil.js?v=0.3";
import { creerCarte, creerMarqueurPosition } from "./carte.js?v=0.3";
import { lireDernierePosition, etatAutorisation, suivrePosition } from "./position.js?v=0.3";
import { initVueTrajet } from "./vue-trajet.js?v=0.3";

// Numéro de version affiché à l'écran : il permet de vérifier qu'on voit bien
// la dernière version publiée (le navigateur garde parfois l'ancienne en mémoire).
const VERSION = "0.3 (étape 3)";
document.getElementById("version").textContent = "Version " + VERSION;

// ---------- Panneau « Mon véhicule » ----------

const panneauProfil = document.getElementById("vue-profil");
const boutonVehicule = document.getElementById("bouton-vehicule");

function ouvrirProfil() {
  panneauProfil.hidden = false;
  panneauProfil.scrollTop = 0;
  boutonVehicule.textContent = "🗺️ Carte";
}

function fermerProfil() {
  panneauProfil.hidden = true;
  boutonVehicule.textContent = "🚗 Mon véhicule";
}

boutonVehicule.addEventListener("click", () => (panneauProfil.hidden ? ouvrirProfil() : fermerProfil()));
document.getElementById("fermer-profil").addEventListener("click", fermerProfil);

const profil = initVueProfil({ surAllerCarte: fermerProfil });

// Première visite : on commence par le profil du véhicule.
if (!profil) {
  document.getElementById("bienvenue").hidden = false;
  ouvrirProfil();
}

// ---------- Carte et position ----------

const carte = creerCarte("carte", lireDernierePosition());
const marqueur = creerMarqueurPosition(carte);

// La carte change de taille quand la carte « Itinéraire » s'agrandit ou se replie.
new ResizeObserver(() => carte.invalidateSize()).observe(document.getElementById("carte"));

const bandeau = document.getElementById("bandeau-position");
const bandeauTexte = document.getElementById("bandeau-texte");
const boutonAutoriser = document.getElementById("bouton-autoriser");
const boutonRecentrer = document.getElementById("bouton-recentrer");

const TEXTE_REFUS =
  "Slalom n'a pas accès à ta position.\n\n" +
  "Sur iPhone : ouvre l'appli Réglages → Confidentialité et sécurité → Service de localisation. " +
  "Vérifie qu'il est activé, puis touche Chrome (ou « Sites web Safari ») et choisis « Lorsque l'app est active ».\n\n" +
  "Reviens ensuite ici et recharge la page.";

function afficherBandeau(texte, avecBouton = false) {
  bandeauTexte.textContent = texte;
  boutonAutoriser.hidden = !avecBouton;
  bandeau.hidden = false;
}

function masquerBandeau() {
  bandeau.hidden = true;
}

let positionActuelle = null;
let arreterSuivi = null;
let centrerDesQuePossible = true;

function centrerSurMoi() {
  carte.setView([positionActuelle.lat, positionActuelle.lon], Math.max(carte.getZoom(), 16));
}

function demarrerSuivi() {
  if (arreterSuivi) return;
  afficherBandeau("Recherche de ta position…");
  arreterSuivi = suivrePosition(
    (p) => {
      positionActuelle = p;
      masquerBandeau();
      marqueur.mettreAJour(p);
      boutonRecentrer.classList.add("actif");
      vueTrajet.positionDisponible();
      if (centrerDesQuePossible) {
        centrerDesQuePossible = false;
        centrerSurMoi();
      }
    },
    (erreur) => {
      if (erreur.code === erreur.PERMISSION_DENIED) {
        arreterSuivi();
        arreterSuivi = null;
        afficherBandeau(TEXTE_REFUS);
      } else if (!positionActuelle) {
        afficherBandeau("Position introuvable pour l'instant. Vérifie que la localisation est activée, puis touche le bouton ◎ en bas à droite.");
      }
    },
  );
}

boutonAutoriser.addEventListener("click", demarrerSuivi);

// ---------- Itinéraire ----------

const vueTrajet = initVueTrajet({
  carte,
  obtenirPosition: () => positionActuelle,
  ouvrirProfil,
});

boutonRecentrer.addEventListener("click", () => {
  if (positionActuelle) {
    centrerSurMoi();
  } else {
    centrerDesQuePossible = true;
    demarrerSuivi();
  }
});

// Au démarrage : si la position est déjà autorisée, on la suit tout de suite.
// Sinon, on explique pourquoi on en a besoin avant que le téléphone ne demande.
etatAutorisation().then((etat) => {
  if (etat === "granted") demarrerSuivi();
  else if (etat === "denied") afficherBandeau(TEXTE_REFUS);
  else if (etat === "indisponible") afficherBandeau("Ce navigateur ne permet pas de connaître ta position.");
  else afficherBandeau("Slalom a besoin de ta position pour centrer la carte sur toi. Ton téléphone va te demander l'autorisation.", true);
});
