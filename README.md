# Guide creation du referentiel Docurba

## Étape 1 - Télécharger les données régionales de Banatic

- Rendez-vous sur : [https://www.banatic.interieur.gouv.fr/export](https://www.banatic.interieur.gouv.fr/export).
- Sélectionnez **"Intercommunalité"** puis l’échelon **"Export National ou Régional"**.
- Téléchargez chaque région individuellement. Le fichier national est trop volumineux pour être traité en une seule fois.

---

## Étape 2 - Conversion des fichiers XLSX en JSON

- Placez tous les fichiers `.xlsx` téléchargés dans le dossier suivant : `inputs/xlsx/Membres_regions`.
- Assurez-vous de créer un dossier `inputs/json` avant de lancer le script.
- Lancez le script helper JSON pour convertir les fichiers `.xlsx` en JSON.

---

## Étape 3 - Exporter les codes SIREN des communes

- Sur [Banatic Export](https://www.banatic.interieur.gouv.fr/export), sélectionnez :
  - Périmètre des données : **Zone géographique**,
  - Échelon : **France**,
  - Type d’information : **Données de toutes les communes de France**.
- Dans les données à sélectionner :
  - **Indispensables** : Code INSEE et N° SIREN.
  - **Optionnelles** : Méta-données comme les zonages (montagne, quartiers prioritaires, etc.).
- Téléchargez le fichier `.xlsx` et exportez la feuille en `.csv` avec un logiciel compatible.

---

## Étape 4 - Télécharger le COG

- Téléchargez les fichiers suivants :
  1. [Liste des communes](https://www.insee.fr/fr/information/2560452) (format : CSV),
  2. [Base des EPCI](https://www.insee.fr/fr/information/2510634) (format : XLSX),
  3. [Base des EPT](https://www.insee.fr/fr/information/2510634) (format : XLSX).
- Pour les EPCI et les EPT, exportez les feuilles de composition communale en format `.csv`.

---

## Étape 5 - Lancer le script `convertCSVInputsToReferentiel.js`

- Ajoutez une **SUPABASE ADMIN KEY** dans le script avant de le lancer.
- Ce script est nécessaire pour lire les procédures.  
  > Objectif : Si Banatic n'indique pas une collectivité comme porteuse mais qu’il existe une procédure sur ce périmètre, cette collectivité doit apparaître dans le référentiel de recherche/dashboard.
