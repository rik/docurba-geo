import fs from 'fs'
import path from 'path'

import { createReadStream, writeFileSync } from "fs";
import Papa from "papaparse";

import _ from 'lodash'

import departements from './data/departements.json' assert {type: 'json'}

import { createClient } from '@supabase/supabase-js'
// DEV
// 'https://drncrjteathtblggsgxi.supabase.co'
// PROD
// 'https://ixxbyuandbmplfnqtxyw.supabase.co'
const supabase = createClient('https://ixxbyuandbmplfnqtxyw.supabase.co', process.env.SUPABASE_ADMIN_KEY, {
  auth: { persistSession: false }
})

function readJsonFilesInFolder(folderPath, cb) {
  try {
    // Read all files in the folder
    const files = fs.readdirSync(folderPath);

    // Filter for JSON files
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    // Process each JSON file
    jsonFiles.forEach(file => {
      const filePath = path.join(folderPath, file);
      
      // Read the content of the JSON file
      const rawData = fs.readFileSync(filePath, 'utf8');
      
      // Parse the JSON data
      const jsonData = JSON.parse(rawData);
      
      console.log(`Processing file: ${file}`);
      // console.log('Data:', jsonData);

      cb(jsonData)

      // Here you can manipulate or process the jsonData as needed
      // For example: 
      // jsonData.forEach(item => { console.log(item); });
    });

  } catch (err) {
    console.error('Error reading JSON files:', err);
  }
}

async function parseCsv(filePath) {
  console.log(`Starting to parse: ${filePath}`); // Log when parsing starts

  return await new Promise((resolve) => {
    const stream = createReadStream(filePath);

    Papa.parse(stream, {
      header: true,
      error: (err) => {
        console.log(`Error parsing ${filePath}:`, err); // Log parsing errors
      },
      complete: (result) => {
        console.log(`Finished parsing: ${filePath}`); // Log when parsing finishes
        resolve(result);
      }
    });
  });
}

async function parseInputs () {
  try {
    console.time('CSV Parsing Time'); // Measure total time for all parsing operations

    const { data: communeSiren } = await parseCsv('./inputs/csv/communes_siren.csv');
    const { data: communes } = await parseCsv('./inputs/csv/communes_2024.csv');
    const { data: compositionCommunes } = await parseCsv('./inputs/csv/Composition_communale-Table 1.csv');
    const { data: compositionsEPT } = await parseCsv('./inputs/csv/Composition_communale-Table_EPT.csv');

    console.timeEnd('CSV Parsing Time'); // Measure total time for all parsing operations
    console.log('All CSV files parsed successfully.', communeSiren.length, communes.length);

    return {communeSiren, communes, compositionCommunes, compositionsEPT}
  } catch (error) {
    console.error('Error during CSV parsing:', error); // Catch and log any unexpected errors
  }
}

const {
  communeSiren,
  communes,
  compositionCommunes,
  compositionsEPT
} = await parseInputs()

const communesSirenMap = {}
const communesInseeMap = {}
const groupementsMap = {}

communeSiren.forEach(commune => {
  const code = commune['Code INSEE de la commune']
  const siren = commune['Siren']

  const inseeCommune = communes.find(c => c.COM === code)

  communesSirenMap[siren] = {
    code,
    siren,
    type: inseeCommune.TYPECOM,
    intitule: inseeCommune.LIBELLE,
    regionCode: inseeCommune.REG,
    departementCode: inseeCommune.DEP,
    groupements: [],
    membres: [],
    intercommunaliteCode: '',
    competencePLU: true,
    competenceSCOT: false
  }

  communesInseeMap[code] = communesSirenMap[siren]
})

compositionCommunes.forEach(commune => {
  const insee = commune.CODGEO
  const epci = commune.EPCI

  if(epci && !epci.includes('Z')) {
    communesInseeMap[insee].intercommunaliteCode = epci
  }
})

compositionsEPT.forEach(commune => {
  const insee = commune.CODGEO
  const epci = commune.EPCI

  if(epci && !epci.includes('Z')) {
    communesInseeMap[insee].intercommunaliteCode = epci
  }
})

let nbMissingCommunes = 0

communes.forEach(commune => {
  if(commune.TYPECOM === 'COMD' || commune.TYPECOM === 'COMA') {
    const parent = communesInseeMap[commune.COMPARENT]

    communesInseeMap[`${commune.COM}_COMD`] = {
      code: commune.COM,
      codeParent: commune.COMPARENT,
      siren: '',
      type: commune.TYPECOM,
      intitule: commune.LIBELLE,
      regionCode: commune.REG,
      departementCode: commune.DEP,
      groupements: [],
      membres: [],
      intercommunaliteCode: '',
      competencePLU: false,
      competenceSCOT: false
    }

    parent.membres.push({
      code: commune.COM,
      type: commune.TYPECOM,
      intitule: commune.LIBELLE,
    })
  } else {
    // We check if all communes are inserted from Banatic
    if(!communesInseeMap[commune.COM]) {
      nbMissingCommunes += 1
      console.log('missing commune in Banatic', commune.COM)
    }
  }
})

// We iterate a first time to populate all groupements
readJsonFilesInFolder('./inputs/json', (membres) => {
  membres.forEach(membre => {
    const sirenGroupement = membre['N° SIREN']
    const departement = departements.find(d => d.intitule === membre['Département'])

    if(!groupementsMap[sirenGroupement]) {
      groupementsMap[sirenGroupement] = {
        type: membre['Nature juridique'],
        intitule: membre['Nom du groupement'],
        siren: sirenGroupement,
        code: sirenGroupement,
        regionCode: departement.region.code,
        departementCode: departement.code,
        competencePLU: membre["5510 - Plan local d'urbanisme et document d'urbanisme en tenant lieu (Art. L. 153-1 du code de l'urbanisme)"] === 'OUI',
        competenceSCOT: membre["5500 - Schéma de cohérence territoriale (SCOT) (Art. L. 143-16 code de l'urbanisme)"] === 'OUI',
        membres: [],
        groupements: []
      }
    }
  })
})

let missingMembres = 0

// Then a second time to populate all members.
readJsonFilesInFolder('./inputs/json', (membres) => {
  // We iterate region by region to create group referentiel.
  membres.forEach(membre => {
    const sirenGroupement = membre['N° SIREN']
    const sirenMembre = membre['Siren membre']

    const groupement = groupementsMap[sirenGroupement]
    const membreRef = communesSirenMap[sirenMembre] || groupementsMap[sirenMembre]

    if(membreRef) {
      membreRef.groupements.push({
        type: membre['Nature juridique'],
        intitule: membre['Nom du groupement'],
        siren: sirenGroupement,
        code: sirenGroupement,
      })

      if(groupement.competencePLU) {
        membreRef.competencePLU = false
      }

      groupement.membres.push({
        type: membreRef.type,
        intitule: membreRef.intitule,
        siren: sirenMembre,
        code: membreRef.code
      })
    } else {
      missingMembres += 1
      // console.log('Missing member', sirenMembre)
    }
  })
})

console.log(Object.keys(groupementsMap).length)
console.log(Object.keys(communesInseeMap).length)
console.log(`Missing communes: ${nbMissingCommunes}, missing membres: ${missingMembres}`)

const groupementsArray = _.map(groupementsMap, group => group)
const communesArray = _.map(communesInseeMap, c => c)

const searchableGroupements = []

for (let index = 0; index < groupementsArray.length; index++) {
  const group = groupementsArray[index];

  if(group.competencePLU || group.competenceSCOT) {
    searchableGroupements.push(group)
  } else {
    const {data} = await supabase.from('procedures').select('id')
      .in('status', ['opposable', 'en cours'])
      .eq('collectivite_porteuse_id', group.code)
      .limit(1)

    if(data.length) {
      searchableGroupements.push(group)
    }
  }

  console.log(`search filter ${index}/${groupementsArray.length}`)
}

console.log('searchableGroupements', searchableGroupements.length)

fs.writeFileSync('./output/groupements_2024_map.json', JSON.stringify(groupementsMap, null, 2))
fs.writeFileSync('./output/communes_2024_map.json', JSON.stringify(communesInseeMap, null, 2))

fs.writeFileSync('./output/groupements_2024.json', JSON.stringify(groupementsArray, null, 2))
fs.writeFileSync('./output/communes_2024.json', JSON.stringify(communesArray, null, 2))

fs.writeFileSync('./output/groupements_competents_2024.json', JSON.stringify(searchableGroupements, null, 2))
