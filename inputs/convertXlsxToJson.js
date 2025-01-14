import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the input and output folder paths
const inputFolderPath = path.join(__dirname, 'xlsx/Membres_regions');
const outputFolderPath = path.join(__dirname, 'json');

// Create output folder if it doesn't exist
if (!fs.existsSync(outputFolderPath)) {
  fs.mkdirSync(outputFolderPath);
}

// Function to convert xlsx to JSON (using first row as keys for objects)
async function convertXlsxToJson(inputPath, outputPath) {
  try {
    // Read the workbook from the input xlsx file
    const workbook = xlsx.readFile(inputPath);

    // Get the first sheet from the workbook (change index for other sheets)
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert the sheet to JSON (first row is used as the keys for the objects)
    const jsonData = xlsx.utils.sheet_to_json(worksheet);

    // Write JSON data to a file
    fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2), 'utf8');
    console.log(`JSON file saved at: ${outputPath}`);
  } catch (error) {
    console.error(`Error converting ${inputPath} to JSON:`, error);
  }
}

// Function to process all xlsx files in the input folder
async function convertAllXlsxInFolder(inputFolder, outputFolder) {
  try {
    // Read all files in the input folder
    const files = fs.readdirSync(inputFolder);

    // Filter for xlsx files
    const xlsxFiles = files.filter(file => file.endsWith('.xlsx'));

    // Convert each xlsx file to json
    for (const file of xlsxFiles) {
      const inputFilePath = path.join(inputFolder, file);
      const outputFilePath = path.join(outputFolder, file.replace('.xlsx', '.json'));

      console.log(`Converting ${file} to JSON...`);

      // Convert xlsx to json
      await convertXlsxToJson(inputFilePath, outputFilePath);
    }

    console.log('All files have been processed.');
  } catch (err) {
    console.error('Error processing files:', err);
  }
}

// Run the conversion for all xlsx files in the input folder
convertAllXlsxInFolder(inputFolderPath, outputFolderPath);
