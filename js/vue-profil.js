// Écran « Mon véhicule » : formulaire du profil et résumé.
import { CHAMPS, SEUIL_PAR_DEFAUT, lireProfil, enregistrerProfil, verifierProfil, doitEviterObstacles } from "./profil.js?v=0.2";

const formulaire = document.getElementById("form-profil");
const message = document.getElementById("message-profil");
const boutonAllerCarte = document.getElementById("aller-carte");

// Remplit le formulaire avec le profil enregistré (ou le seuil par défaut).
function remplirFormulaire(profil) {
  for (const cle of Object.keys(CHAMPS)) {
    if (profil) formulaire.elements[cle].value = profil[cle];
  }
  if (!profil) formulaire.elements.seuil.value = SEUIL_PAR_DEFAUT;
}

// Lit les valeurs tapées dans le formulaire (nombres entiers, en cm).
function lireFormulaire() {
  const profil = {};
  for (const cle of Object.keys(CHAMPS)) {
    const texte = formulaire.elements[cle].value.trim().replace(",", ".");
    profil[cle] = texte === "" ? NaN : Math.round(Number(texte));
  }
  return profil;
}

function afficherErreurs(erreurs) {
  for (const cle of Object.keys(CHAMPS)) {
    const bloc = formulaire.elements[cle].closest(".champ");
    bloc.classList.toggle("invalide", Boolean(erreurs[cle]));
    bloc.querySelector(".erreur").textContent = erreurs[cle] || "";
  }
}

// Explique en clair ce que l'appli va faire avec ce profil.
function afficherResume(profil) {
  const bloc = document.getElementById("resume-profil");
  const liste = document.getElementById("resume-liste");
  if (!profil) { bloc.hidden = true; return; }

  const lignes = [
    `Les passages limités à moins de ${profil.hauteur} cm de hauteur.`,
    `Les rues limitées à moins de ${profil.largeur} cm de largeur.`,
    `Les rues limitées à moins de ${profil.longueur} cm de longueur.`,
    `Les passages étroits que tu as signalés.`,
  ];
  liste.replaceChildren(...lignes.map((texte) => {
    const li = document.createElement("li");
    li.textContent = texte;
    return li;
  }));

  const li = document.createElement("li");
  if (doitEviterObstacles(profil)) {
    li.textContent = `Les ralentisseurs et les obstacles signalés : ta garde au sol (${profil.garde} cm) est sous ton seuil (${profil.seuil} cm).`;
  } else {
    li.className = "non";
    li.textContent = `Pas d'évitement des ralentisseurs : ta garde au sol (${profil.garde} cm) n'est pas sous ton seuil (${profil.seuil} cm).`;
  }
  liste.append(li);
  bloc.hidden = false;
}

// Prépare l'écran. `surAllerCarte` est appelé quand on touche « Voir la carte ».
export function initVueProfil({ surAllerCarte }) {
  formulaire.addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    const profil = lireFormulaire();
    const { ok, erreurs } = verifierProfil(profil);
    afficherErreurs(erreurs);

    if (!ok) {
      message.className = "message ko";
      message.textContent = "Vérifie les champs en rouge.";
      return;
    }
    if (!enregistrerProfil(profil)) {
      message.className = "message ko";
      message.textContent = "Impossible d'enregistrer sur ce téléphone (navigation privée ?).";
      return;
    }
    message.className = "message ok";
    message.textContent = "✓ Profil enregistré";
    boutonAllerCarte.hidden = false;
    afficherResume(profil);
    document.getElementById("bienvenue").hidden = true;
    document.activeElement?.blur(); // referme le clavier
  });

  // Efface le message de confirmation dès qu'on modifie une valeur.
  formulaire.addEventListener("input", () => {
    message.textContent = "";
    boutonAllerCarte.hidden = true;
  });

  boutonAllerCarte.addEventListener("click", surAllerCarte);

  const profil = lireProfil();
  remplirFormulaire(profil);
  afficherResume(profil);
  return profil;
}
