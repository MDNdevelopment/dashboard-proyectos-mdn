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

  const marginX = 36;
  const marginTop = 70;
  const marginBottom = 36;
  const columns = 4;
  const gap = 16;
  const colWidth = (pageWidth - marginX * 2 - gap * (columns - 1)) / columns;
  const lineHeight = 14;
  const groupGap = 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Clientes por social — MDN Publicidad", marginX, 40);

  let col = 0;
  let y = marginTop;
  let counter = 1;

  function colX(c) {
    return marginX + c * (colWidth + gap);
  }

  function nextColumn() {
    col += 1;
    counter = 1;
    if (col >= columns) {
      col = 0;
      doc.addPage();
    }
    y = marginTop;
  }

  for (const group of groups) {
    const blockHeight = lineHeight + group.clients.length * lineHeight + groupGap;
    if (y + blockHeight > pageHeight - marginBottom && y > marginTop) {
      nextColumn();
    }

    const x = colX(col);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(group.manager.toUpperCase(), x, y);
    y += lineHeight;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    for (const name of group.clients) {
      if (y > pageHeight - marginBottom) {
        nextColumn();
        // El nombre del social se repite al reiniciar columna, para no perder contexto.
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`${group.manager.toUpperCase()} (cont.)`, colX(col), y);
        y += lineHeight;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
      }
      doc.text(`${counter}. ${name}`, colX(col), y);
      counter += 1;
      y += lineHeight;
    }

    y += groupGap;
  }

  doc.save("clientes-por-social.pdf");
}
