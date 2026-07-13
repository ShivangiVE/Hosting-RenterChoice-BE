const { getDocumentText } = require("../documentExtraction");
const invoiceParser = require("../documentExtraction/parsers/invoiceParser");

exports.extractInvoiceData = async ({ filePath, mimeType }) => {
  const { rawText, blocks, provider } = await getDocumentText({
    filePath,
    mimeType,
  });
  const parsed = invoiceParser.parse({ rawText, blocks, provider });
  return { ...parsed, provider };
};
