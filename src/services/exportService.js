const fs = require("fs");
const path = require("path");
const PdfPrinter = require("pdfmake");
const ExcelJS = require("exceljs");

function buildTagPills(tagArray = [], buildings = [], portfolios = []) {
  if (!Array.isArray(tagArray) || tagArray.length === 0) {
    return [{ text: "—", fontSize: 9 }];
  }

  return tagArray.map((tag) => ({
    text: getTagLabel(tag, buildings, portfolios),
    fontSize: 9,
    background: "#E6F6F4",
    borderRadius: 12,
    margin: [0, 1, 0, 1],
  }));
}

function formatWorkOrderType(type = "") {
  if (!type) return "—";
  return type.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatCategory(value, categories = []) {
  if (!value) return "—";

  if (value && typeof value === "object" && value.name) {
    return value.name;
  }

  if (typeof value === "string" && !/^[0-9a-fA-F]{24}$/.test(value)) {
    return value;
  }
  if (categories && Array.isArray(categories)) {
    const categoryId = value._id ? String(value._id) : String(value);
    const match = categories.find((c) => String(c._id) === categoryId);
    if (match) return match.name;
  }

  return String(value || "—");
}

/**
 * DOCUMENT_CONFIGS
 * - Add additional modules (note, workOrder, inspectionRequest, serviceAgreement, etc.)
 *   by following the structure below.
 */
const DOCUMENT_CONFIGS = {
  task: {
    title: "Tasks Report",
    numberField: "taskNumber",
    // fields to present in detail PDF modal-style
    pdfDetailFields: (item, tags, buildings, portfolios) => [
      { label: "Task Number", value: item.taskNumber || "—" },
      { label: "Category", value: item.category?.name || "—" },
      {
        label: "Description",
        value: item.fullDescription || item.description || "—",
      },
      { label: "Assigned To", value: item.assignedTo?.preferredName || "—" },
      { label: "Assigned By", value: item.createdBy?.preferredName || "—" },
      {
        label: "Due Date",
        value: item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—",
      },
      { label: "Status", value: item.status || "—" },
      {
        label: "Tags",
        value: buildTagPills(item.tags || [], buildings, portfolios),
      },
      {
        label: "Created Date",
        value: item.createdAt ? new Date(item.createdAt).toLocaleString() : "—",
      },
    ],
    // excel: mapping function
    excelFields: (item, index, tags) => ({
      "#": index + 1,
      "Task Number": item.taskNumber || "—",
      Category: item.category?.name || "—",
      Description: item.fullDescription || item.description || "—",
      "Assigned To": item.assignedTo?.preferredName || "—",
      "Assigned By": item.createdBy?.preferredName || "—",
      "Due Date": item.dueDate
        ? new Date(item.dueDate).toLocaleDateString()
        : "—",
      Status: item.status || "—",
      Tags: tags,
      "Created Date": item.createdAt
        ? new Date(item.createdAt).toLocaleString()
        : "—",
    }),
    columnWidths: [
      { wch: 5 },
      { wch: 18 },
      { wch: 20 },
      { wch: 50 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 40 },
      { wch: 18 },
    ],
  },

  todo: {
    title: "To Dos Report",
    numberField: "todoNumber",
    pdfDetailFields: (item, tags, buildings, portfolios) => [
      { label: "To Do Number", value: item.todoNumber || "—" },
      { label: "Category", value: item.category?.name || "—" },
      {
        label: "Description",
        value: item.fullDescription || item.description || "—",
      },
      { label: "Assigned To", value: item.assignedTo?.preferredName || "—" },
      { label: "Assigned By", value: item.createdBy?.preferredName || "—" },
      { label: "Status", value: item.status || "—" },
      {
        label: "Tags",
        value: buildTagPills(item.tags || [], buildings, portfolios),
      },
      {
        label: "Created Date",
        value: item.createdAt ? new Date(item.createdAt).toLocaleString() : "—",
      },
    ],
    excelFields: (item, index, tags) => ({
      "#": index + 1,
      "Todo Number": item.todoNumber || "—",
      Category: item.category?.name || "—",
      Description: item.fullDescription || item.description || "—",
      "Assigned To": item.assignedTo?.preferredName || "—",
      "Assigned By": item.createdBy?.preferredName || "—",
      Status: item.status || "—",
      Tags: tags,
      "Created Date": item.createdAt
        ? new Date(item.createdAt).toLocaleString()
        : "—",
    }),
    columnWidths: [
      { wch: 5 },
      { wch: 18 },
      { wch: 20 },
      { wch: 50 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 },
      { wch: 40 },
    ],
  },

  note: {
    title: "Notes Report",
    numberField: "subject",
    pdfDetailFields: (item) => [
      { label: "Subject", value: item.subject || "—" },
      { label: "Category", value: item.category?.name || "—" },
      { label: "Description", value: item.description || "—" },
      {
        label: "Created Date",
        value: item.createdAt ? new Date(item.createdAt).toLocaleString() : "—",
      },
      {
        label: "Created By",
        value: item.createdBy?.preferredName || item.createdBy?.email || "—",
      },
    ],
    excelFields: (item, index) => ({
      "#": index + 1,
      Subject: item.subject || "—",
      Category: item.category?.name || "—",
      Description: item.description || "—",
      "Created Date": item.createdAt
        ? new Date(item.createdAt).toLocaleString()
        : "—",
      "Created By":
        item.createdBy?.preferredName || item.createdBy?.email || "—",
    }),
    columnWidths: [
      { wch: 5 },
      { wch: 30 },
      { wch: 20 },
      { wch: 50 },
      { wch: 30 },
      { wch: 20 },
    ],
  },

  workOrder: {
    title: "Work Orders Report",
    numberField: "workOrderNumber",

    pdfDetailFields: (item, tags, buildings, portfolios, categories = []) => [
      { label: "Work Order #", value: item.workOrderNumber || "—" },
      { label: "Type", value: formatWorkOrderType(item.workOrderType) },
      { label: "Category", value: formatCategory(item.category, categories) },
      {
        label: "Building",
        value:
          item.building?.formData?.address ||
          item.building?.buildingAbbreviation ||
          "—",
      },
      {
        label: "Vendor",
        value: item.vendor
          ? `${item.vendor.companyName || ""} ${
              item.vendor.technicianName || ""
            }`.trim()
          : "N/A",
      },
      { label: "Description", value: item.description || "—" },
      { label: "Key Issued", value: item.keyIssued ? "Yes" : "No" },
      { label: "Status", value: item.status?.toUpperCase() || "—" },
      {
        label: "Dynamic Status",
        value: item.dynamicStatus?.name || "—",
      },
      {
        label: "Due Date",
        value: item.dueDate
          ? new Date(item.dueDate).toLocaleDateString()
          : "N/A",
      },
      {
        label: "Completed Date",
        value: item.completeDate
          ? new Date(item.completeDate).toLocaleDateString()
          : "N/A",
      },
      { label: "Closing Comments", value: item.closingComments || "—" },
      {
        label: "Created Date",
        value: item.createdAt ? new Date(item.createdAt).toLocaleString() : "—",
      },
    ],

    excelFields: (item, index, tags, categories = []) => ({
      "#": index + 1,
      "Work Order #": item.workOrderNumber || "—",
      Type: formatWorkOrderType(item.workOrderType),
      Category: formatCategory(item.category, categories),
      Description: item.description || "—",
      Vendor: item.vendor
        ? `${item.vendor.companyName || ""} ${
            item.vendor.technicianName || ""
          }`.trim()
        : "N/A",
      Building:
        item.building?.formData?.address ||
        item.building?.buildingAbbreviation ||
        "—",
      Status: item.status || "—",
      "Dynamic Status": item.dynamicStatus?.name || "—",
      "Due Date": item.dueDate
        ? new Date(item.dueDate).toLocaleDateString()
        : "—",
      "Complete Date": item.completeDate
        ? new Date(item.completeDate).toLocaleDateString()
        : "—",
      "Closing Comments": item.closingComments || "—",
      "Created Date": item.createdAt
        ? new Date(item.createdAt).toLocaleString()
        : "—",
    }),

    columnWidths: [
      { wch: 5 },
      { wch: 18 },
      { wch: 15 },
      { wch: 20 },
      { wch: 40 },
      { wch: 20 },
      { wch: 30 },
      { wch: 15 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 30 },
      { wch: 20 },
    ],
  },

  serviceAgreement: {
    title: "Service Agreements Report",
    numberField: "serviceAgreementNumber",

    pdfDetailFields: (item) => [
      {
        label: "Service Agreement #",
        value: item.serviceAgreementNumber || "—",
      },
      { label: "Category", value: item.category?.name || item.category || "—" },
      {
        label: "Building",
        value:
          item.building?.formData?.address ||
          item.building?.buildingAbbreviation ||
          "—",
      },
      {
        label: "Vendor",
        value: item.vendor
          ? `${item.vendor.companyName || ""} ${
              item.vendor.technicianName || ""
            }`.trim()
          : "N/A",
      },
      { label: "Description", value: item.description || "—" },
      {
        label: "Initial Due Date",
        value: item.initialDueDate
          ? new Date(item.initialDueDate).toLocaleDateString()
          : "—",
      },
      { label: "Recurring Schedule", value: item.recurringSchedule || "—" },
      { label: "Status", value: item.status || "—" },
      {
        label: "Created Date",
        value: item.createdAt ? new Date(item.createdAt).toLocaleString() : "—",
      },
    ],

    excelFields: (item, index) => ({
      "#": index + 1,
      "Service Agreement #": item.serviceAgreementNumber || "—",
      Category: item.category?.name || item.category || "—",
      Building:
        item.building?.formData?.address ||
        item.building?.buildingAbbreviation ||
        "—",
      Vendor: item.vendor
        ? `${item.vendor.companyName || ""} ${
            item.vendor.technicianName || ""
          }`.trim()
        : "N/A",
      Description: item.description || "—",
      "Initial Due Date": item.initialDueDate
        ? new Date(item.initialDueDate).toLocaleDateString()
        : "—",
      "Recurring Schedule": item.recurringSchedule || "—",
      Status: item.status || "—",
      "Created Date": item.createdAt
        ? new Date(item.createdAt).toLocaleDateString()
        : "—",
    }),

    columnWidths: [
      { wch: 5 },
      { wch: 20 },
      { wch: 20 },
      { wch: 40 },
      { wch: 40 },
      { wch: 50 },
      { wch: 15 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
    ],
  },

  inspectionRequest: {
    title: "Inspection Requests Report",
    numberField: "inspectionNumber",

    pdfDetailFields: (item) => [
      { label: "Inspection #", value: item.inspectionNumber || "—" },
      { label: "Type of Inspection", value: item.inspectionType || "—" },
      {
        label: "Building",
        value:
          item.building?.formData?.address ||
          item.building?.buildingAbbreviation ||
          "—",
      },
      {
        label: "Portfolio",
        value:
          item.building?.portfolio?.portfolioAbbreviation ||
          item.building?.portfolio?.formData?.name ||
          "—",
      },
      {
        label: "Assigned To",
        value: item.assignedTo?.preferredName || item.assignedTo?.email || "—",
      },
      {
        label: "Due Date",
        value: item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—",
      },
      { label: "Status", value: item.status || "—" },
      { label: "Key Issued", value: item.keyIssued ? "Yes" : "No" },
      { label: "Notes", value: item.notes || "—" },
      {
        label: "Created Date",
        value: item.createdAt ? new Date(item.createdAt).toLocaleString() : "—",
      },
    ],

    excelFields: (item, index) => ({
      "#": index + 1,
      "Inspection #": item.inspectionNumber || "—",
      "Type of Inspection": item.inspectionType || "—",
      Building:
        item.building?.formData?.address ||
        item.building?.buildingAbbreviation ||
        "—",
      Portfolio:
        item.building?.portfolio?.portfolioAbbreviation ||
        item.building?.portfolio?.formData?.name ||
        "—",
      "Assigned To":
        item.assignedTo?.preferredName || item.assignedTo?.email || "—",
      "Due Date": item.dueDate
        ? new Date(item.dueDate).toLocaleDateString()
        : "—",
      Status: item.status || "—",
      "Key Issued": item.keyIssued ? "Yes" : "No",
      Notes: item.notes || "—",
      "Created Date": item.createdAt
        ? new Date(item.createdAt).toLocaleDateString()
        : "—",
    }),

    columnWidths: [
      { wch: 5 },
      { wch: 20 },
      { wch: 25 },
      { wch: 40 },
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
      { wch: 40 },
      { wch: 20 },
    ],
  },
};

/**
 * Helper: resolve tag -> label using building/portfolio arrays
 */
const getTagLabel = (tag, buildings = [], portfolios = []) => {
  if (!tag) return "—";
  try {
    if (tag.startsWith("building:")) {
      const id = tag.replace("building:", "");
      const b = buildings.find((x) => String(x._id) === String(id));
      return b?.formData?.address || b?.name || id;
    }
    if (tag.startsWith("portfolio:")) {
      const id = tag.replace("portfolio:", "");
      const p = portfolios.find((x) => String(x._id) === String(id));
      return p?.portfolioAbbreviation || p?.name || id;
    }
    return tag;
  } catch (err) {
    return tag;
  }
};

/**
 * Validate config
 */
const getConfig = (documentType) => {
  const cfg = DOCUMENT_CONFIGS[documentType];
  if (!cfg) throw new Error(`Unknown documentType: ${documentType}`);
  return cfg;
};

/**
 * Generate PDF using pdfmake (server-side) with updated styling
 * returns Buffer
 */
const generatePDF = async (
  items = [],
  documentType,
  buildings = [],
  portfolios = [],
  categories = []
) => {
  const cfg = getConfig(documentType);

  // Fonts configuration
  const fonts = {
    Helvetica: {
      normal: "Helvetica",
      bold: "Helvetica-Bold",
      italics: "Helvetica-Oblique",
      bolditalics: "Helvetica-BoldOblique",
    },
  };

  const printer = new PdfPrinter(fonts);

  // Build docDefinition with updated styling
  const content = [];

  // Add report header
  content.push(
    {
      text: cfg.title,
      style: "reportTitle",
      margin: [0, 0, 0, 10],
    },
    {
      text: `Generated on: ${new Date().toLocaleString()}`,
      style: "reportSubtitle",
      margin: [0, 0, 0, 20],
    },
    {
      text: `Total Records: ${items.length}`,
      style: "reportSubtitle",
      margin: [0, 0, 0, 20],
    }
  );

  items.forEach((rawItem, idx) => {
    // rawItem may be Mongoose doc: convert to plain object if necessary
    const item = rawItem.toObject ? rawItem.toObject() : rawItem;

    // tags resolution
    const tags =
      (item.tags || [])
        .map((t) => getTagLabel(t, buildings, portfolios))
        .join(", ") || "—";

    const detailFields = cfg.pdfDetailFields(
      item,
      tags,
      buildings,
      portfolios,
      categories
    );

    // Item header with document number - updated styling
    const itemNumber = item[cfg.numberField] || `Item ${idx + 1}`;
    content.push({
      text: `${itemNumber}`,
      style: "itemHeader",
      margin: [0, idx === 0 ? 0 : 15, 0, 8],
    });

    // Build table rows as [label, value] with updated styling
    const tableBody = detailFields.map((f) => {
      const valueCell = Array.isArray(f.value)
        ? {
            stack: f.value.map((p) => ({
              ...p,
              margin: [0, 2, 4, 2],
            })),
          }
        : { text: String(f.value || "—"), style: "fieldValue" };

      return [{ text: f.label, style: "fieldLabel" }, valueCell];
    });

    content.push({
      table: {
        widths: ["30%", "70%"],
        body: tableBody,
      },
      layout: {
        hLineWidth: (i, node) =>
          i === 0 || i === node.table.body.length ? 1 : 0.5,
        vLineWidth: () => 0,
        hLineColor: (i) => (i === 0 ? "#F37D2F" : "#E6E6E6"),
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6,
      },
      margin: [0, 0, 0, 10],
    });

    // Add page break after every item except last
    if (idx !== items.length - 1) {
      content.push({ text: "", pageBreak: "after" });
    }
  });

  const docDefinition = {
    defaultStyle: {
      font: "Helvetica",
      fontSize: 10,
    },
    styles: {
      reportTitle: {
        fontSize: 18,
        bold: true,
        color: "#1F2937",
        alignment: "center",
      },
      reportSubtitle: {
        fontSize: 11,
        color: "#6B7280",
        alignment: "center",
      },
      itemHeader: {
        fontSize: 14,
        bold: true,
        color: "#F37D2F",
        margin: [0, 10, 0, 5],
      },
      fieldLabel: {
        bold: true,
        fontSize: 9,
        color: "#4B5563",
        margin: [0, 2, 0, 2],
      },
      fieldValue: {
        fontSize: 9,
        color: "#374151",
        margin: [0, 2, 0, 2],
      },
    },
    content,
    info: {
      title: cfg.title,
      author: "YourAppName",
      subject: `${cfg.title} - Generated Report`,
      keywords: `${cfg.title}, report, export`,
      creationDate: new Date(),
    },
    pageMargins: [40, 60, 40, 60],
    header: (currentPage, pageCount) => ({
      text: `${cfg.title} - Page ${currentPage} of ${pageCount}`,
      alignment: "right",
      fontSize: 9,
      color: "#6B7280",
      margin: [40, 20, 40, 0],
    }),
    // footer: (currentPage, pageCount) => ({
    //   text: `Generated on ${new Date().toLocaleDateString()} • Confidential`,
    //   alignment: "center",
    //   fontSize: 8,
    //   color: "#9CA3AF",
    //   margin: [40, 0, 40, 20],
    // }),
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const chunks = [];
  return new Promise((resolve, reject) => {
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", (err) => reject(err));
    pdfDoc.end();
  });
};

/**
 * Generate Excel (xlsx) and return Buffer using ExcelJS
 */
const generateExcel = async (
  items = [],
  documentType,
  buildings = [],
  portfolios = [],
  categories = []
) => {
  const cfg = getConfig(documentType);

  // Convert items into usable row objects
  const rows = items.map((rawItem, idx) => {
    const item = rawItem.toObject ? rawItem.toObject() : rawItem;
    const tags =
      (item.tags || [])
        .map((t) => getTagLabel(t, buildings, portfolios))
        .join(", ") || "—";
    return cfg.excelFields(item, idx, tags, categories);
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(cfg.title || documentType);

  // Extract keys in the correct order
  const headers = Object.keys(rows[0] || {});

  // Apply column widths (your config)
  if (cfg.columnWidths && Array.isArray(cfg.columnWidths)) {
    worksheet.columns = cfg.columnWidths.map((colWidth, i) => ({
      header: headers[i] || "",
      key: headers[i] || "",
      width: colWidth.wch || 20,
    }));
  } else {
    worksheet.columns = headers.map((key) => ({
      header: key,
      key,
      width: 20,
    }));
  }

  // Insert data rows
  rows.forEach((row) => worksheet.addRow(row));

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

/**
 * Public generator
 * inputs:
 * - items: array (mongoose docs or plain objects)
 * - documentType: key in DOCUMENT_CONFIGS
 * - format: "pdf" | "excel"
 * - buildings, portfolios: optional arrays to resolve tags
 */
const generateExport = async ({
  items,
  documentType,
  format = "pdf",
  buildings = [],
  portfolios = [],
  categories = [],
}) => {
  if (!items || !Array.isArray(items))
    throw new Error("items must be an array");
  if (!documentType) throw new Error("documentType required");
  if (!["pdf", "excel"].includes(format))
    throw new Error("format must be 'pdf' or 'excel'");

  if (format === "pdf") {
    return await generatePDF(
      items,
      documentType,
      buildings,
      portfolios,
      categories
    );
  } else {
    return await generateExcel(
      items,
      documentType,
      buildings,
      portfolios,
      categories
    );
  }
};

module.exports = {
  generateExport,
  // also export Generate helpers if you want to call them directly
  generatePDF,
  generateExcel,
};
