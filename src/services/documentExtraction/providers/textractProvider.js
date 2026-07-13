exports.getDocumentText = async () => {
  throw new Error(
    "Textract provider not yet configured. Install @aws-sdk/client-textract and implement extraction before switching DOCUMENT_EXTRACTION_PROVIDER to 'textract'.",
  );
};
