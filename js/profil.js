// Profil du véhicule : lecture, vérification et enregistrement sur le téléphone.
// Les mesures sont en centimètres.

const CLE_STOCKAGE = "slalom.profil";

export const SEUIL_PAR_DEFAUT = 12;

// Limites acceptées pour chaque mesure (en cm), avec un nom lisible.
export const CHAMPS = {
  hauteur:  { nom: "La hauteur",       min: 50,  max: 450 },
  largeur:  { nom: "La largeur",       min: 100, max: 350 },
  longueur: { nom: "La longueur",      min: 200, max: 2000 },
  garde:    { nom: "La garde au sol",  min: 2,   max: 60 },
  seuil:    { nom: "Le seuil",         min: 2,   max: 60 },
};

// Lit le profil enregistré. Renvoie null s'il n'y en a pas encore.
export function lireProfil() {
  try {
    const texte = localStorage.getItem(CLE_STOCKAGE);
    if (!texte) return null;
    const profil = JSON.parse(texte);
    return verifierProfil(profil).ok ? profil : null;
  } catch {
    return null;
  }
}

// Enregistre le profil. Renvoie true si l'enregistrement a réussi.
export function enregistrerProfil(profil) {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(profil));
    return true;
  } catch {
    return false;
  }
}

// Vérifie chaque mesure et renvoie les erreurs éventuelles, champ par champ.
export function verifierProfil(profil) {
  const erreurs = {};
  for (const [cle, regle] of Object.entries(CHAMPS)) {
    const valeur = profil?.[cle];
    if (typeof valeur !== "number" || Number.isNaN(valeur)) {
      erreurs[cle] = `${regle.nom} est à remplir.`;
    } else if (valeur < regle.min || valeur > regle.max) {
      erreurs[cle] = `${regle.nom} doit être entre ${regle.min} et ${regle.max} cm.`;
    }
  }
  return { ok: Object.keys(erreurs).length === 0, erreurs };
}

// Vrai si la voiture est assez basse pour devoir éviter les ralentisseurs.
export function doitEviterObstacles(profil) {
  return profil.garde < profil.seuil;
}
