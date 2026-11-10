// Slalom : application de navigation pour voitures basses, larges ou longues.
import { CHAMPS, SEUIL_PAR_DEFAUT, lireProfil, enregistrerProfil, verifierProfil, doitEviterObstacles } from "./profil.js";

// Numéro de version affiché à l'écran : il permet de vérifier qu'on voit bien
// la dernière version publiée (le navigateur garde parfois l'ancienne en mémoire).
const VERSION = "0.1 (étape 1)";

document.getElementById("version").textContent = "Version " + VERSION;

const formulaire = document.getElementById("form-profil");
const message = document.getElementById("message-profil");

// Remplit le formulaire avec le profil enregistré (ou le seuil par défaut).
function remplirFormulaire(profil) {
  for (const cle of Object.keys(CHAMPS)) {
    const champ = formulaire.elements[cle];
    if (profil) champ.value = profil[cle];
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
  afficherResume(profil);
  document.activeElement?.blur(); // referme le clavier
});

// Efface le message de confirmation dès qu'on modifie une valeur.
formulaire.addEventListener("input", () => { message.textContent = ""; });

const profilEnregistre = lireProfil();
remplirFormulaire(profilEnregistre);
afficherResume(profilEnregistre);
