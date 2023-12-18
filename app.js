import { createReadStream, writeFileSync } from "fs"
import Papa from "papaparse"
import axios from "axios"
import matching from "./data/matching-siren-insee.json" assert { type: "json" }

const BANATIC_DOWNLOAD_URL = "https://www.banatic.interieur.gouv.fr/V5/fichiers-en-telechargement/telecharger.php"
const BANATIC_ARCHIVE_DATE = "01/10/2023"
const INSEE_COMMUNES_PATH = "./data/v_commune_2023.csv"
const INSEE_COMMUNES_SINCE_1943_PATH = "./data/v_commune_depuis_1943.csv"
const INSEE_REGIONS_PATH = "./data/v_region_2023.csv"
const INSEE_MVT_COMMUNES_PATH = "./data/v_mvtcommune_2023.csv"

const BANATIC_EPCI_TYPES = ["CA", "CC", "CU", "METRO", "MET69"]

const BANATIC_PARSER_CONFIG = {
  delimiter: "\t",
  escapeChar: "",
  quoteChar: "",
  skipEmptyLines: true
}

async function papaParsePromise(streamOrString, banaticFormat = false) {
  const parsed = await new Promise((resolve) => {
    Papa.parse(streamOrString, {
      header: true,
      ...(banaticFormat ? BANATIC_PARSER_CONFIG : {}),
      error: (err) => {
        console.error(err)
      },
      complete: (results) => {
        resolve(results)
      }
    })
  })

  if (parsed.errors.length) {
    console.error(parsed.errors)
    throw new Error("CSV parsing error");
  }

  return parsed.data
}

async function parseCsvFile(path) {
  const stream = createReadStream(path)

  const parsed = await papaParsePromise(stream)
  stream.close()

  return parsed
}


async function getBanaticPerimetresByRegion(regionCode) {
  const { data } = await axios.get(BANATIC_DOWNLOAD_URL, {
    params: {
      zone: `R${regionCode}`,
      date: BANATIC_ARCHIVE_DATE,
      format: "D"
    },
    responseEncoding: "latin1"
  })

  return papaParsePromise(data, true)
}

async function getBanaticCompetences() {
  const { data } = await axios.get(BANATIC_DOWNLOAD_URL, {
    params: {
      zone: "N",
      date: BANATIC_ARCHIVE_DATE,
      format: "C"
    },
    responseEncoding: "latin1"
  })

  return papaParsePromise(data, true)
}

async function main() {
  let mouvements = await parseCsvFile(INSEE_MVT_COMMUNES_PATH)
  const indexBefore2001 = mouvements.findIndex(c => Number(c["DATE_EFF"].slice(0, 4)) < 2001)
  mouvements = mouvements
    .slice(0, indexBefore2001)
    .filter(m => !([10, 20, 30].includes(m["MOD"])))

  function getEvents(code, avoid = []) {
    const events = mouvements.filter(e => e["COM_AP"] === code)

    const oldCodes = [
      ...new Set(
        events
          .filter(e => e["COM_AV"] !== code && !avoid.includes(e["COM_AV"]))
          .map(e => e["COM_AV"])
      )
    ]

    return [...events, ...oldCodes.flatMap(c => getEvents(c, [code, ...avoid]))]
  }

  console.time("parsing INSEE communes")

  const communesDates = (await parseCsvFile(INSEE_COMMUNES_SINCE_1943_PATH))

  const communes = (await parseCsvFile(INSEE_COMMUNES_PATH))
    .filter(com => com["TYPECOM"] !== "ARM") // ignore arrondissement
    .map((com, index, array) => {
      const formatted = {
        type: com["TYPECOM"],
        intitule: com["LIBELLE"],
        code: com["COM"],
        dateCreation: communesDates.find(cd => cd["COM"] === com["COM"])["DATE_DEBUT"]
      }

      if (formatted.type === "COM") {
        formatted.regionCode = com["REG"]
        formatted.departementCode = com["DEP"]

        formatted.siren = matching.find((m) => m.insee === com["COM"])?.siren
        formatted.groupements = []

        if (!formatted.siren) {
          throw new Error("SIREN not found for INSEE code " + com["COM"])
        }

        const events = getEvents(com["COM"])
        const history = []

        // group events by mod type & date
        for (const e of events) {
          let historyItem = history.find(i => i.mod === e["MOD"] && i.date === e["DATE_EFF"])
          if (!historyItem) {
            historyItem = {
              mod: e["MOD"],
              date: e["DATE_EFF"],
              events: []
            }

            history.push(historyItem)
          }

          historyItem.events.push({
            before: {
              type: e["TYPECOM_AV"],
              code: e["COM_AV"],
              nom: e["LIBELLE_AV"],
            },
            after: {
              type: e["TYPECOM_AP"],
              code: e["COM_AP"],
              nom: e["LIBELLE_AP"],
            },
          })
        }

        formatted.history = history;
      } else {
        const comParent = array.find(row => row["COM"] === com["COMPARENT"])
        formatted.regionCode = comParent["REG"]
        formatted.departementCode = comParent["DEP"]
        formatted.codeParent = com["COMPARENT"]
      }

      return formatted
    })
  console.timeEnd("parsing INSEE communes")

  // fetch perimetres for every regions
  const perimetres = []
  console.time("fetching perimetres")
  const regions = await parseCsvFile(INSEE_REGIONS_PATH)
  for (const region of regions) {
    perimetres.push(...(await getBanaticPerimetresByRegion(region["REG"])))
  }
  console.timeEnd("fetching perimetres")

  console.time("fetching & parsing BANATIC groupements")
  const groupements = (await getBanaticCompetences())
    .map(g => {
      return {
        type: g["Nature juridique"],
        nom: g["Nom du groupement"],
        siren: g["N° SIREN"],
        regionCode: g["Région siège"].split(" - ")[0],
        departementCode: g["Département siège"].split(" - ")[0],
        competencePLU: g["C4515"] === "1",
        competenceSCOT: g["C4505"] === "1",
        membres: [],
        groupements: [],
      }
    })
  console.timeEnd("fetching & parsing BANATIC groupements")

  console.time("liaison groupements et membres")
  const couples = perimetres.filter(p => p["Type"] !== "Autre organisme")
  for (const couple of couples) {
    const membre = couple["Type"] === "Commune"
      ? communes.find(com => com.siren === couple["Siren membre"])
      : groupements.find(g => g.siren === couple["Siren membre"])

    if (!membre) {
      console.error(couple)
      throw new Error("Membre introuvable")
    }

    const groupement = groupements.find(g => g.siren === couple["N° SIREN"])

    groupement.membres.push({ type: membre.type, siren: membre.siren })
    membre.groupements.push({ type: groupement.type, siren: groupement.siren })

    if (membre.type === "COM" && BANATIC_EPCI_TYPES.includes(groupement.type)) {
      if (membre.intercommunaliteCode) {
        throw new Error(`La commune ${membre.code} fait déjà partie d'une intercommunalité`)
      }
      membre.intercommunaliteCode = groupement.siren
      membre.intercommunaliteName = groupement.nom
    }
  }
  console.timeEnd("liaison groupements et membres")

  console.time("déduction des compétences des communes")
  for (const commune of communes) {
    if (commune.type !== "COM") continue

    const communeGroupements = commune.groupements.map(({ siren }) => {
      const groupement = groupements.find(g => g.siren === siren)
      if (!groupement) throw new Error()
      return groupement
    })

    if (!communeGroupements?.length) {
      commune.competencePLU = true
      commune.competenceSCOT = true
    } else {
      commune.competencePLU = communeGroupements.every(g => !g.competencePLU),
      commune.competenceSCOT = communeGroupements.every(g => !g.competenceSCOT)
    }
  }
  console.timeEnd("déduction des compétences des communes")

  console.time("écriture des fichiers")
  writeFileSync("./output/communes.json", JSON.stringify(communes, null, "\t"))
  writeFileSync("./output/groupements.json", JSON.stringify(groupements, null, "\t"))
  console.timeEnd("écriture des fichiers")
}

main()