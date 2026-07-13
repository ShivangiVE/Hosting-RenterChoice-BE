const fs = require("fs");
const pdfParse = require("pdf-parse");
const { createWorker } = require("tesseract.js");

async function extractViaTextLayer(filePath) {
  const buffer = fs.readFileSync(filePath);
  const { text } = await pdfParse(buffer);
  return text || "";
}

async function extractViaOCR(filePath) {
  const worker = await createWorker("eng");
  const { data } = await worker.recognize(filePath);
  await worker.terminate();
  return data.text || "";
}

exports.getDocumentText = async ({ filePath, mimeType }) => {
  try {
    let rawText = "";

    if (mimeType === "application/pdf") {
      rawText = await extractViaTextLayer(filePath);
    }

    if (!rawText || rawText.trim().length < 20) {
      rawText = await extractViaOCR(filePath);
    }

    return { rawText, blocks: [], provider: "local" };
  } catch (err) {
    console.error("Local document extraction failed:", err.message);
    return { rawText: "", blocks: [], provider: "local" };
  }
};
