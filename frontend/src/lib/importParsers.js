import * as XLSX from "xlsx";

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseCsvRows(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((header) => normalizeKey(header));

  return lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((value) => value.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });
}

async function parseSpreadsheetRows(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows.map((row) => {
    const normalized = {};
    Object.keys(row).forEach((key) => {
      normalized[normalizeKey(key)] = String(row[key] ?? "").trim();
    });
    return normalized;
  });
}

async function readRowsFromFile(file) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    const text = await file.text();
    return parseCsvRows(text);
  }
  return parseSpreadsheetRows(file);
}

export async function parseDelegatesFile(file) {
  const rows = await readRowsFromFile(file);
  return rows
    .map((row) => {
      const document_id =
        row.documento || row.document_id || row.cedula || row.identificacion || row.id || "";
      const full_name = row.nombre || row.full_name || row.name || row.delegado || "";
      return { document_id: String(document_id).trim(), full_name: String(full_name).trim() };
    })
    .filter((item) => item.document_id && item.full_name);
}

export async function parsePointsFile(file) {
  const rows = await readRowsFromFile(file);
  return rows
    .map((row) => {
      const orderRaw = row.orden || row.order || row.numero || row.punto || "";
      const title = row.titulo || row.title || row.pregunta || row.asunto || "";
      const description = row.descripcion || row.description || row.detalle || title;
      const order = Number(orderRaw);
      return {
        order: Number.isFinite(order) ? order : 0,
        title: String(title).trim(),
        description: String(description).trim(),
      };
    })
    .filter((item) => item.order > 0 && item.title && item.description);
}

export function parsePointsTextBlock(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [orderRaw, title = "", ...descParts] = line.split(",");
      const order = Number(String(orderRaw || "").trim());
      const description = descParts.join(",").trim() || title.trim();
      return { order, title: title.trim(), description };
    })
    .filter((item) => item.order > 0 && item.title && item.description);
}
