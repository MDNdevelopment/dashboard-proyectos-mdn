/**
 * Export a PDF de la cartera de clientes agrupada por social (community
 * manager asignado, `social_manager_id`). Reproduce la hoja impresa que usa
 * el equipo: una cuadrícula tipo hoja de cálculo de 4 columnas, con el nombre
 * del social centrado en negritas y sus cuentas numeradas debajo, dejando
 * espacio a la derecha de cada cuenta para marcarla a mano. Las filas sobrantes
 * se dibujan vacías hasta el pie de la página, como en la hoja original.
 *
 * Usa jsPDF (import dinámico, mismo criterio que ExcelJS en
 * exportAdsToExcel.js) para no cargar la librería en el bundle principal.
 */

const SIN_SOCIAL = 'Sin social asignado'
const VACACIONES_SUFFIX = ' (de vacaciones)'

/**
 * Agrupa los clientes activos por social manager, resuelve su nombre contra
 * `employees` y reparte los grupos EN COLUMNAS: **una columna por línea**
 * (`metric_lines`, en orden de `sort_order`), con la **jefa de línea primero**
 * (`line.lead_user_id`) y debajo el resto de socials de esa línea
 * (`line.member_user_ids`) en orden alfabético — así cada columna de la hoja
 * impresa arranca con la jefa de su línea.
 *
 * Los socials que no pertenecen a ninguna línea (alfabéticos) y "Sin social
 * asignado" se agregan al FINAL de la última columna: no tienen línea propia y
 * darles una columna entera dejaría media hoja vacía.
 *
 * Las líneas sin ningún social con cuentas no generan columna.
 *
 * El nombre del social es solo su PRIMER NOMBRE (`first_name`), como en la hoja
 * impresa: en 4 columnas el nombre completo no cabe y obligaba a envolverlo. A
 * quien esté de vacaciones se le agrega " (de vacaciones)".
 *
 * Separada de la generación del PDF para poder testearla sin jsPDF.
 *
 * @param {Array} clients - clientes de metric_clients (pueden incluir archivados)
 * @param {Array} employees - filas de loadCompanyEmployees (user_id, first_name, last_name)
 * @param {Array} lines - filas de loadLines (id, sort_order, lead_user_id, member_user_ids)
 * @param {Iterable<string>} onVacationIds - user_ids de quienes están de vacaciones hoy
 * @returns {Array<Array<{ manager: string, clients: string[] }>>} una lista de grupos por columna.
 */
export function buildClientColumns(clients, employees = [], lines = [], onVacationIds = []) {
  const employeesById = new Map(employees.map((e) => [e.user_id, e]))
  const onVacation = new Set(onVacationIds)
  const activeClients = clients.filter((c) => !c.deleted_at)

  const groups = new Map() // key: social_manager_id ?? '__none__', value: { managerId, manager, clients: [] }

  for (const client of activeClients) {
    const managerId = client.social_manager_id ?? null
    const key = managerId ?? '__none__'
    if (!groups.has(key)) {
      const employee = managerId ? employeesById.get(managerId) : null
      // Solo el primer nombre; si viniera vacío, se cae al apellido para no dejar el
      // encabezado en blanco.
      const name = employee
        ? (employee.first_name || '').trim() || (employee.last_name || '').trim() || SIN_SOCIAL
        : SIN_SOCIAL
      const manager = managerId && onVacation.has(managerId) ? `${name}${VACACIONES_SUFFIX}` : name
      groups.set(key, { managerId, manager, clients: [] })
    }
    groups.get(key).clients.push(client.name)
  }

  const allGroups = Array.from(groups.values())
  allGroups.forEach((g) => g.clients.sort((a, b) => a.localeCompare(b, 'es')))

  const noneGroup = allGroups.find((g) => g.managerId == null)
  const managerGroups = allGroups.filter((g) => g.managerId != null)

  const sortedLines = lines.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const placed = new Set()
  const columns = []

  for (const line of sortedLines) {
    const memberIds = line.member_user_ids ?? []
    const leaderId = line.lead_user_id
    const column = []

    if (leaderId && !placed.has(leaderId)) {
      const leaderGroup = managerGroups.find((g) => g.managerId === leaderId)
      if (leaderGroup) {
        column.push(leaderGroup)
        placed.add(leaderId)
      }
    }

    const teamGroups = managerGroups
      .filter((g) => memberIds.includes(g.managerId) && !placed.has(g.managerId))
      .sort((a, b) => a.manager.localeCompare(b.manager, 'es'))
    teamGroups.forEach((g) => placed.add(g.managerId))
    column.push(...teamGroups)

    if (column.length > 0) columns.push(column)
  }

  const leftovers = managerGroups
    .filter((g) => !placed.has(g.managerId))
    .sort((a, b) => a.manager.localeCompare(b.manager, 'es'))
  if (noneGroup) leftovers.push(noneGroup)

  if (leftovers.length > 0) {
    if (columns.length === 0) columns.push([])
    columns[columns.length - 1].push(...leftovers)
  }

  return columns.map((column) => column.map(({ manager, clients }) => ({ manager, clients })))
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
  const words = text.split(' ').filter(Boolean)
  if (words.length === 0) return ['']

  const lines = []
  let current = ''

  function fits(str) {
    return measureText(str, fontSize) <= maxWidth
  }

  function splitLongWord(word) {
    // Parte una palabra sin espacios que por sí sola excede maxWidth.
    const parts = []
    let chunk = ''
    for (const char of word) {
      const candidate = chunk + char
      if (chunk !== '' && !fits(candidate)) {
        parts.push(chunk)
        chunk = char
      } else {
        chunk = candidate
      }
    }
    if (chunk) parts.push(chunk)
    return parts
  }

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (fits(candidate)) {
      current = candidate
      continue
    }
    if (current) {
      lines.push(current)
      current = ''
    }
    if (fits(word)) {
      current = word
    } else {
      const chunks = splitLongWord(word)
      chunks.slice(0, -1).forEach((c) => lines.push(c))
      current = chunks[chunks.length - 1] ?? ''
    }
  }
  if (current) lines.push(current)

  return lines.length > 0 ? lines : ['']
}

/**
 * Calcula el layout del PDF de clientes por social como una CUADRÍCULA de filas de
 * alto fijo (`columns` × `rows` celdas por página), sin depender de jsPDF.
 *
 * Modelar el layout en celdas `(col, row)` — en vez de ir acumulando una `y` libre — es
 * lo que permite dibujar los bordes alineados de la hoja impresa y que un nombre
 * envuelto a dos líneas no desfase la columna vecina.
 *
 * Recibe los grupos YA REPARTIDOS EN COLUMNAS (ver `buildClientColumns`): la columna N de
 * la hoja es la línea N, empezando por su jefa. Si una columna no cabe en la página, su
 * resto continúa en **esa misma columna de la página siguiente** — nunca se corre a la
 * columna vecina, que pertenece a otra línea. Las columnas que sobran de `columns` (más
 * líneas que columnas por página) también pasan a la página siguiente.
 *
 * Cada grupo ocupa: 1 fila de encabezado (nombre del social, centrado y en negritas),
 * 1 fila por cuenta (`N. Nombre`, alineada a la izquierda; la mitad derecha de la celda
 * queda libre para marcar a mano) y 1 fila en blanco de separación. Un nombre que no cabe
 * en el ancho de columna se envuelve y consume una fila extra, con sangría francesa.
 * La numeración de las cuentas es continua dentro de cada columna y reinicia en la siguiente.
 *
 * @param {Array<Array<{manager: string, clients: string[]}>>} columnGroups - grupos por columna
 * @param {object} opts - { pageWidth, pageHeight, marginX, marginTop, marginBottom,
 *   columns, rowHeight, cellPadX, headerFontSize, bodyFontSize }
 * @param {(text: string, fontSize: number) => number} measureText - ancho en pt
 * @returns {{ cells: Array<{page:number, col:number, row:number, text:string, bold:boolean, align:'left'|'center', indent:number, fontSize:number}>, rows: number, pageCount: number }}
 */
export function computeClientSheetLayout(columnGroups, opts, measureText) {
  const {
    pageWidth,
    pageHeight,
    marginX,
    marginTop,
    marginBottom,
    columns,
    rowHeight,
    cellPadX,
    headerFontSize,
    bodyFontSize,
  } = opts

  const colWidth = (pageWidth - marginX * 2) / columns
  const rows = Math.max(1, Math.floor((pageHeight - marginTop - marginBottom) / rowHeight))
  // Ancho útil de texto dentro de una celda: se descuenta el padding de ambos lados.
  const textWidth = colWidth - cellPadX * 2

  /** Filas que ocuparía este texto (1 por línea envuelta). */
  function headerRows(text) {
    return wrapToWidth(text, textWidth, headerFontSize, measureText)
  }

  const cells = []
  let pageCount = 1

  columnGroups.forEach((groups, index) => {
    // Cada columna de datos cae en su posición fija de la rejilla; a partir de la
    // columna `columns` se sigue en la página siguiente, misma posición.
    let page = Math.floor(index / columns)
    const col = index % columns
    let row = 0
    let counter = 1

    /** Continúa esta misma columna en la página siguiente (nunca invade la vecina). */
    function nextPage() {
      page += 1
      row = 0
      counter = 1
      pageCount = Math.max(pageCount, page + 1)
    }

    function pushHeader(text) {
      const lines = headerRows(text)
      if (row + lines.length > rows && row > 0) nextPage()
      lines.forEach((line) => {
        cells.push({
          page,
          col,
          row,
          text: line,
          bold: true,
          align: 'center',
          indent: 0,
          fontSize: headerFontSize,
        })
        row += 1
      })
    }

    pageCount = Math.max(pageCount, page + 1)

    for (const group of groups) {
      const header = group.manager.toUpperCase()
      // Si no cabe al menos el encabezado + una cuenta, el grupo arranca en la página
      // siguiente en vez de partirse justo al empezar.
      if (row > 0 && row + headerRows(header).length + 1 > rows) nextPage()

      pushHeader(header)

      for (const name of group.clients) {
        const prefix = `${counter}. `
        const indent = measureText(prefix, bodyFontSize)
        const lines = wrapToWidth(name, textWidth - indent, bodyFontSize, measureText)

        if (row + lines.length > rows && row > 0) {
          nextPage()
          // El nombre del social se repite al continuar, para no perder contexto.
          pushHeader(`${header} (cont.)`)
        }

        lines.forEach((line, i) => {
          cells.push({
            page,
            col,
            row,
            text: i === 0 ? `${prefix}${line}` : line,
            bold: false,
            align: 'left',
            indent: i === 0 ? 0 : indent,
            fontSize: bodyFontSize,
          })
          row += 1
        })
        counter += 1
      }

      // Fila en blanco de separación entre grupos (no se emite celda: la rejilla ya
      // dibuja su borde).
      row += 1
      if (row >= rows) nextPage()
    }
  })

  return { cells, rows, pageCount }
}

/**
 * Genera y descarga el PDF de clientes por social. Incluye siempre todos
 * los clientes activos (no archivados), sin depender de los filtros de
 * pantalla.
 */
export async function exportClientsToPdf({ clients, employees, lines, onVacationIds = [] }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  renderClientSheet(doc, buildClientColumns(clients, employees, lines, onVacationIds))
  doc.save('clientes-por-social.pdf')
}

/**
 * Dibuja la hoja de clientes sobre un documento jsPDF ya creado. Separada de
 * `exportClientsToPdf` (que solo crea el doc y lo descarga) para poder generar el PDF
 * fuera del navegador y compararlo con la hoja impresa de referencia.
 *
 * @param {import('jspdf').jsPDF} doc
 * @param {Array<{manager: string, clients: string[]}>} groups
 */
export function renderClientSheet(doc, groups) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const opts = {
    pageWidth,
    pageHeight,
    marginX: 28,
    marginTop: 56,
    marginBottom: 28,
    columns: 4,
    rowHeight: 17,
    cellPadX: 4,
    headerFontSize: 8.5,
    bodyFontSize: 8.5,
  }

  function measureText(text, fontSize) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(fontSize)
    return doc.getTextWidth(text)
  }

  const { cells, rows, pageCount } = computeClientSheetLayout(groups, opts, measureText)

  const colWidth = (pageWidth - opts.marginX * 2) / opts.columns
  const colX = (c) => opts.marginX + c * colWidth
  const rowY = (r) => opts.marginTop + r * opts.rowHeight
  // Línea base del texto dentro de la celda: centrada verticalmente, a ojo.
  const baselineY = (r) => rowY(r) + opts.rowHeight - 5.5

  /** Marco completo de la página: todas las celdas, incluidas las vacías del final. */
  function drawGrid() {
    doc.setDrawColor(150)
    doc.setLineWidth(0.4)
    for (let c = 0; c < opts.columns; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        doc.rect(colX(c), rowY(r), colWidth, opts.rowHeight)
      }
    }
  }

  function drawTitle() {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0)
    doc.text('Clientes por social — MDN Publicidad', opts.marginX, opts.marginTop - 14)
  }

  drawTitle()
  drawGrid()

  let currentPage = 0
  for (const cell of cells) {
    if (cell.page > currentPage) {
      doc.addPage()
      currentPage = cell.page
      drawTitle()
      drawGrid()
    }
    doc.setFont('helvetica', cell.bold ? 'bold' : 'normal')
    doc.setFontSize(cell.fontSize)
    if (cell.align === 'center') {
      doc.text(cell.text, colX(cell.col) + colWidth / 2, baselineY(cell.row), {
        align: 'center',
      })
    } else {
      doc.text(cell.text, colX(cell.col) + opts.cellPadX + cell.indent, baselineY(cell.row))
    }
  }

  // Las páginas sin ninguna celda (caso raro: un último grupo que solo aporta la fila en
  // blanco) igual llevan su rejilla, para que la hoja impresa nunca salga a medias.
  for (let p = currentPage + 1; p < pageCount; p += 1) {
    doc.addPage()
    drawTitle()
    drawGrid()
  }
}
