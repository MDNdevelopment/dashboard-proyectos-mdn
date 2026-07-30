/**
 * Export a PDF de la cartera de clientes agrupada por social (community
 * manager asignado, `social_manager_id`). Cada grupo lista sus cuentas
 * (clientes) numeradas, distribuidas en columnas — formato solicitado por
 * el equipo para tener un listado simple e imprimible.
 *
 * Usa jsPDF (import dinámico, mismo criterio que ExcelJS en
 * exportAdsToExcel.js) para no cargar la librería en el bundle principal.
 */

const SIN_SOCIAL = "Sin social asignado";

/**
 * Agrupa los clientes activos por social manager y resuelve su nombre
 * contra `employees`. Separada de la generación del PDF para poder
 * testearla sin jsPDF.
 *
 * Orden: por línea (según `metric_lines.sort_order`), con la **jefa de
 * línea primero** (`line.lead_user_id`) y debajo el resto de socials
 * miembros de esa misma línea (`line.member_user_ids`), en orden
 * alfabético. Socials que no pertenecen a ninguna línea quedan al final,
 * en orden alfabético, y "Sin social asignado" siempre cierra la lista.
 *
 * @param {Array} clients - clientes de metric_clients (pueden incluir archivados)
 * @param {Array} employees - filas de loadCompanyEmployees (user_id, first_name, last_name)
 * @param {Array} lines - filas de loadLines (id, sort_order, lead_user_id, member_user_ids)
 * @returns {Array<{ manager: string, clients: string[] }>} grupos ordenados.
 */
export function buildClientGroups(clients, employees = [], lines = []) {
  const employeesById = new Map(employees.map((e) => [e.user_id, e]));
  const activeClients = clients.filter((c) => !c.deleted_at);

  const groups = new Map(); // key: social_manager_id ?? '__none__', value: { managerId, manager, clients: [] }

  for (const client of activeClients) {
    const managerId = client.social_manager_id ?? null;
    const key = managerId ?? "__none__";
    if (!groups.has(key)) {
      const employee = managerId ? employeesById.get(managerId) : null;
      const manager = employee
        ? `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim()
        : SIN_SOCIAL;
      groups.set(key, { managerId, manager, clients: [] });
    }
    groups.get(key).clients.push(client.name);
  }

  const allGroups = Array.from(groups.values());
  allGroups.forEach((g) => g.clients.sort((a, b) => a.localeCompare(b, "es")));

  const noneGroup = allGroups.find((g) => g.managerId == null);
  const managerGroups = allGroups.filter((g) => g.managerId != null);

  const sortedLines = lines
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const placed = new Set();
  const ordered = [];

  for (const line of sortedLines) {
    const memberIds = line.member_user_ids ?? [];
    const leaderId = line.lead_user_id;

    if (leaderId && !placed.has(leaderId)) {
      const leaderGroup = managerGroups.find((g) => g.managerId === leaderId);
      if (leaderGroup) {
        ordered.push(leaderGroup);
        placed.add(leaderId);
      }
    }

    const teamGroups = managerGroups
      .filter((g) => memberIds.includes(g.managerId) && !placed.has(g.managerId))
      .sort((a, b) => a.manager.localeCompare(b.manager, "es"));
    teamGroups.forEach((g) => placed.add(g.managerId));
    ordered.push(...teamGroups);
  }

  const remaining = managerGroups
    .filter((g) => !placed.has(g.managerId))
    .sort((a, b) => a.manager.localeCompare(b.manager, "es"));
  ordered.push(...remaining);

  if (noneGroup) ordered.push(noneGroup);

  return ordered.map(({ manager, clients }) => ({ manager, clients }));
}

/**
 * Parte `text` en varias líneas para que ninguna exceda `maxWidth`, usando
 * `measureText(text, fontSize)` para medir anchos. Corta por palabras y, si
 * una sola palabra ya excede `maxWidth`, la parte por caracteres (evita
 * bucles infinitos con nombres sin espacios más anchos que la columna).
 *
 * Separada de jsPDF para poder testearla con una medición determinista.
 */
export function wrapToWidth(text, maxWidth, fontSize, measureText) {
  const words = text.split(" ").filter(Boolean);
  if (words.length === 0) return [""];

  const lines = [];
  let current = "";

  function fits(str) {
    return measureText(str, fontSize) <= maxWidth;
  }

  function splitLongWord(word) {
    // Parte una palabra sin espacios que por sí sola excede maxWidth.
    const parts = [];
    let chunk = "";
    for (const char of word) {
      const candidate = chunk + char;
      if (chunk !== "" && !fits(candidate)) {
        parts.push(chunk);
        chunk = char;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) parts.push(chunk);
    return parts;
  }

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (fits(word)) {
      current = word;
    } else {
      const chunks = splitLongWord(word);
      chunks.slice(0, -1).forEach((c) => lines.push(c));
      current = chunks[chunks.length - 1] ?? "";
    }
  }
  if (current) lines.push(current);

  return lines.length > 0 ? lines : [""];
}

/**
 * Calcula el layout (posiciones de cada línea de texto a dibujar) para el
 * PDF de clientes por social, sin depender de jsPDF. Cada nombre de social o
 * de cuenta que exceda el ancho de columna se envuelve a varias líneas
 * (con sangría francesa para las cuentas numeradas), de forma que ningún
 * texto invade la columna vecina.
 *
 * @param {Array<{manager: string, clients: string[]}>} groups
 * @param {object} opts - { pageWidth, pageHeight, marginX, marginTop,
 *   marginBottom, columns, gap, lineHeight, groupGap, headerFontSize,
 *   bodyFontSize }
 * @param {(text: string, fontSize: number) => number} measureText - ancho en pt
 * @returns {{ ops: Array<{page:number, col:number, x:number, y:number, text:string, bold:boolean, fontSize:number}>, pageCount: number }}
 */
export function computeClientPdfLayout(groups, opts, measureText) {
  const {
    pageWidth,
    pageHeight,
    marginX,
    marginTop,
    marginBottom,
    columns,
    gap,
    lineHeight,
    groupGap,
    headerFontSize,
    bodyFontSize,
  } = opts;

  const colWidth = (pageWidth - marginX * 2 - gap * (columns - 1)) / columns;

  function colX(c) {
    return marginX + c * (colWidth + gap);
  }

  const ops = [];
  let page = 0;
  let col = 0;
  let y = marginTop;
  let counter = 1;

  function nextColumn() {
    col += 1;
    counter = 1;
    if (col >= columns) {
      col = 0;
      page += 1;
    }
    y = marginTop;
  }

  function headerLines(text) {
    return wrapToWidth(text, colWidth, headerFontSize, measureText);
  }

  // Ancho disponible para el texto de una cuenta tras "N. " (sangría francesa).
  function bodyLines(prefix, name) {
    const indent = measureText(prefix, bodyFontSize);
    const firstLines = wrapToWidth(name, colWidth - indent, bodyFontSize, measureText);
    return { indent, lines: firstLines };
  }

  function pushHeader(text) {
    const lines = headerLines(text);
    const blockHeight = lines.length * lineHeight;
    if (y + blockHeight > pageHeight - marginBottom && y > marginTop) {
      nextColumn();
    }
    const x = colX(col);
    lines.forEach((line) => {
      ops.push({ page, col, x, y, text: line, bold: true, fontSize: headerFontSize });
      y += lineHeight;
    });
  }

  for (const group of groups) {
    // Estimación conservadora del alto del grupo (sin contar aún el wrap de
    // cuentas individuales) para decidir si conviene saltar de columna antes
    // de empezar a dibujarlo.
    const estimatedHeight =
      headerLines(group.manager.toUpperCase()).length * lineHeight +
      group.clients.length * lineHeight +
      groupGap;
    if (y + estimatedHeight > pageHeight - marginBottom && y > marginTop) {
      nextColumn();
    }

    pushHeader(group.manager.toUpperCase());

    for (const name of group.clients) {
      const prefix = `${counter}. `;
      const { indent, lines } = bodyLines(prefix, name);
      const blockHeight = lines.length * lineHeight;

      if (y + blockHeight > pageHeight - marginBottom && y > marginTop) {
        nextColumn();
        // El nombre del social se repite al reiniciar columna, para no perder contexto.
        pushHeader(`${group.manager.toUpperCase()} (cont.)`);
      }

      const x = colX(col);
      lines.forEach((line, i) => {
        const text = i === 0 ? `${prefix}${line}` : line;
        const lineX = i === 0 ? x : x + indent;
        ops.push({ page, col, x: lineX, y, text, bold: false, fontSize: bodyFontSize });
        y += lineHeight;
      });
      counter += 1;
    }

    y += groupGap;
  }

  return { ops, pageCount: page + 1 };
}

/**
 * Genera y descarga el PDF de clientes por social. Incluye siempre todos
 * los clientes activos (no archivados), sin depender de los filtros de
 * pantalla.
 */
export async function exportClientsToPdf({ clients, employees, lines }) {
  const { jsPDF } = await import("jspdf");
  const groups = buildClientGroups(clients, employees, lines);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const opts = {
    pageWidth,
    pageHeight,
    marginX: 36,
    marginTop: 70,
    marginBottom: 36,
    columns: 3,
    gap: 16,
    lineHeight: 14,
    groupGap: 10,
    headerFontSize: 11,
    bodyFontSize: 10.5,
  };

  function measureText(text, fontSize) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    return doc.getTextWidth(text);
  }

  const { ops } = computeClientPdfLayout(groups, opts, measureText);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Clientes por social — MDN Publicidad", opts.marginX, 40);

  let currentPage = 0;
  for (const op of ops) {
    if (op.page > currentPage) {
      doc.addPage();
      currentPage = op.page;
    }
    doc.setFont("helvetica", op.bold ? "bold" : "normal");
    doc.setFontSize(op.fontSize);
    doc.text(op.text, op.x, op.y);
  }

  doc.save("clientes-por-social.pdf");
}
