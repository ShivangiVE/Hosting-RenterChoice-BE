const INVOICE_NUMBER_PATTERNS = [
  // Highest priority: "Invoice #22911" — explicit # followed by digits
  /invoice\s*#\s*(\d{3,10})/i,
  // "Invoice No: 12345" / "Invoice Number: 12345" — but only if digits follow
  /invoice\s*(?:no\.?|number)\s*[:\-]?\s*(\d{3,10})/i,
  // "INV-12345" style, requires at least one digit in the match
  /inv[\s\-]?#?\s*[:\-]?\s*([A-Z0-9\-]*\d[A-Z0-9\-]*)/i,
  // Last resort: bare "#12345"
  /#\s*(\d{3,10})/,
];

const AMOUNT_PATTERNS = [
  // Prefer "Balance" — appears once, cleanly, equal to the real total
  /balance\s*(?:due)?\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i,
  /amount\s*due\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i,
  /grand\s*total\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i,
  // \b prevents matching inside "Subtotal"
  /\btotal\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i,
  /\$\s*([\d,]+\.\d{2})/,
];

function extractFirstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

exports.parse = ({ rawText, blocks, provider }) => {
  if (provider === "textract" && blocks?.length) {
    const getField = (type) => blocks.find((f) => f.Type?.Text === type);
    const invoiceField = getField("INVOICE_RECEIPT_ID");
    const totalField = getField("TOTAL");
    const amountRaw = totalField?.ValueDetection?.Text;

    return {
      invoiceNumber: invoiceField?.ValueDetection?.Text || null,
      amount: amountRaw ? parseFloat(amountRaw.replace(/[^0-9.]/g, "")) : null,
      currency: "CAD",
      confidence: {
        invoiceNumber: (invoiceField?.ValueDetection?.Confidence || 0) / 100,
        amount: (totalField?.ValueDetection?.Confidence || 0) / 100,
      },
    };
  }

  const invoiceNumber = extractFirstMatch(rawText, INVOICE_NUMBER_PATTERNS);
  const amountRaw = extractFirstMatch(rawText, AMOUNT_PATTERNS);
  const amount = amountRaw ? parseFloat(amountRaw.replace(/,/g, "")) : null;

  return {
    invoiceNumber,
    amount,
    currency: "CAD",
    confidence: {
      invoiceNumber: invoiceNumber ? 0.75 : 0,
      amount: amount ? 0.75 : 0,
    },
  };
};
