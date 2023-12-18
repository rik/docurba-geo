import fs from "fs"
import Papa from "papaparse"


async function parseCsvFile(path) {
  const stream = fs.createReadStream(path)

  const parsed = await new Promise((resolve) => {
    Papa.parse(stream, {
      header: true,
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

  stream.close()

  return parsed.data
}

async function main() {
  const matching = (await parseCsvFile("./data/Banatic_SirenInsee2023.csv"))
    .map(m => ({ siren: m.siren, insee: m.insee }))
  fs.writeFileSync("matching-siren-insee.json", JSON.stringify(matching))
}

main()