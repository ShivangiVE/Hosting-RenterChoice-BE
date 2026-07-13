const localProvider = require("./providers/localProvider");
const textractProvider = require("./providers/textractProvider");

// Contract: getDocumentText({ filePath, mimeType }) =>
//   Promise<{ rawText: string, blocks: any[], provider: "local"|"textract" }>
const PROVIDER = process.env.DOCUMENT_EXTRACTION_PROVIDER || "local";
const providers = { local: localProvider, textract: textractProvider };

module.exports = {
  getDocumentText: (input) => {
    const provider = providers[PROVIDER];
    if (!provider) throw new Error(`Unknown extraction provider: ${PROVIDER}`);
    return provider.getDocumentText(input);
  },
};
