import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the input folder containing xlsx files
const inputFolderPath = path.join(__dirname, 'xlsx');
// Path to the output folder where csv files will be saved
const outputFolderPath = path.join(__dirname, 'csv');

// Create output folder if it doesn't exist
if (!fs.existsSync(outputFolderPath)) {
    fs.mkdirSync(outputFolderPath);
}

// Function to convert xlsx to csv for large files
async function convertXlsxToCsv(inputPath, outputPath) {
    try {
        // Read the entire workbook from the input file
        const workbook = xlsx.readFile(inputPath);

        // Get the first worksheet (adjust this if you need other sheets)
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert the worksheet to CSV row by row
        const csvData = xlsx.utils.sheet_to_csv(worksheet);

        console.log(csvData)

        // Write CSV data to the output file
        fs.writeFileSync(outputPath, csvData, 'utf8');
        console.log(`CSV file saved: ${outputPath}`);
    } catch (error) {
        console.error(`Error converting ${inputPath}:`, error);
    }
}

// Function to process all xlsx files in a folder
async function convertAllXlsxInFolder(inputFolder, outputFolder) {
    try {
        // Read all files in the input folder
        const files = fs.readdirSync(inputFolder);

        // Filter for xlsx files
        const xlsxFiles = files.filter(file => file.endsWith('.xlsx'));

        // Convert each xlsx file to csv
        for (const file of xlsxFiles) {
            const inputFilePath = path.join(inputFolder, file);
            const outputFilePath = path.join(outputFolder, file.replace('.xlsx', '.csv'));

            console.log(`Converting ${file} to CSV...`);

            // Convert xlsx to csv
            await convertXlsxToCsv(inputFilePath, outputFilePath);
        }
    } catch (err) {
        console.error('Error processing files:', err);
    }
}

// Run the conversion for all xlsx files in the input folder
convertAllXlsxInFolder(inputFolderPath, outputFolderPath);
