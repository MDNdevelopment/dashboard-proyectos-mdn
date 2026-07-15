/**
 * Export a Excel (.xlsx) de la tabla de Ads (pauta pagada, `paid_campaigns`).
 * Reemplaza al export CSV que antes vivía en la tab Tácticas (AdsList.jsx).
 *
 * Usa ExcelJS (import dinámico) porque es la única librería viable para
 * aplicar estilos de celda (relleno amarillo de marca) e incrustar el logo —
 * SheetJS/xlsx community no soporta ninguna de las dos cosas.
 */
import { RESULT_FIELDS } from '../components/ads/constants'
import { fmtDate, durationDays } from '../components/ads/campaignSpendApi'

const BRAND_YELLOW = 'FFFFB800'
const RESULT_HIGHLIGHT = 'FFFFF3CC'

const HEADERS = [
  'Cliente', 'Nombre de campaña', 'Inicio', 'Fecha fin',
  'Duración', 'Objetivo', 'Pieza', 'Monto', 'Estado',
  ...RESULT_FIELDS.map(f => f.label),
]

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * Construye las filas de datos (un array de valores por ad, en el mismo
 * orden que HEADERS) a partir de la lista de ads ya filtrada/visible.
 * Separada de la generación del workbook para poder testearla sin ExcelJS.
 */
export function buildAdRows(ads) {
  return ads.map(a => {
    const duration = durationDays(a.start_date, a.end_date)
    const isFinalizado = a.status === 'Finalizado'
    return [
      a.client ?? '—',
      a.name ?? '—',
      fmtDate(a.start_date),
      fmtDate(a.end_date),
      duration != null ? `${duration} día${duration !== 1 ? 's' : ''}` : '—',
      a.objective ?? '—',
      a.piece_url ?? null,
      Number(a.amount) || 0,
      a.status ?? '—',
      ...RESULT_FIELDS.map(f => (isFinalizado ? a[f.key] ?? '' : '')),
    ]
  })
}

/**
 * Deriva la URL PNG del logo MDN desde la URL fuente de MDNLogo.jsx,
 * insertando la transformación `f_png` de Cloudinary tras `/upload/`.
 * Así siempre se usa el logo real de marca, sin mantener un binario aparte.
 */
function logoPngUrl() {
  const LOGO_URL = 'https://res.cloudinary.com/mdnclientes/image/upload/v1779727686/MDN-LOGO-PNG-2_1_f8o5gk.webp'
  return LOGO_URL.replace('/upload/', '/upload/f_png/')
}

async function fetchLogoBase64() {
  try {
    const res = await fetch(logoPngUrl())
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  } catch {
    return null
  }
}

/**
 * Genera y descarga el Excel de Ads con el filtro/período actualmente
 * visible en pantalla. Nunca lanza por fallas de red del logo — en ese
 * caso exporta igual, sin logo.
 */
export async function exportAdsToExcel({ ads, responsablesById, periodo }) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Ads')

  sheet.columns = [
    { width: 20 }, { width: 26 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 22 }, { width: 14 }, { width: 12 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
  ]

  const lastCol = HEADERS.length

  // Banner de marca: nombre + período, fondo blanco (el amarillo predomina en la cabecera de tabla).
  sheet.mergeCells(1, 1, 1, lastCol)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = 'MDN Publicidad Studio'
  titleCell.font = { bold: true, size: 22, color: { argb: 'FF111111' } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: periodo ? 8 : 4 }
  sheet.getRow(1).height = 44

  sheet.mergeCells(2, 1, 2, lastCol)
  const subtitleCell = sheet.getCell(2, 1)
  subtitleCell.value = periodo ? `Ads · ${MESES[periodo.month - 1]} ${periodo.year}` : 'Ads'
  subtitleCell.font = { italic: true, size: 14, color: { argb: 'FF444444' } }
  subtitleCell.alignment = { vertical: 'middle', indent: 4 }

  const logoBase64 = await fetchLogoBase64()
  if (logoBase64) {
    const imageId = workbook.addImage({ base64: logoBase64, extension: 'png' })
    sheet.addImage(imageId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 60, height: 60 } })
  }

  // Cabecera de tabla — relleno amarillo de marca (predominante, como pidió el cliente).
  const headerRow = sheet.getRow(3)
  headerRow.values = HEADERS
  headerRow.height = 22
  headerRow.eachCell(cell => {
    cell.font = { bold: true, size: 13, color: { argb: 'FF111111' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_YELLOW } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
  })

  const resultStartCol = HEADERS.length - RESULT_FIELDS.length + 1

  const rows = buildAdRows(ads)
  rows.forEach(row => {
    const excelRow = sheet.addRow(row)
    excelRow.height = 20
    excelRow.font = { size: 12 }

    const monto = excelRow.getCell(8)
    monto.numFmt = '"$"#,##0.00'

    const pieza = excelRow.getCell(7)
    if (pieza.value) {
      pieza.value = { text: 'Ver pieza', hyperlink: pieza.value }
      pieza.font = { size: 12, color: { argb: 'FF3B6FE0' }, underline: true }
    } else {
      pieza.value = '—'
    }

    // Realce de las columnas de resultado con amarillo tenue de marca.
    for (let c = resultStartCol; c <= HEADERS.length; c++) {
      excelRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RESULT_HIGHLIGHT } }
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ads_${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
