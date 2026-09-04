/**
 * Narrativa automática determinística del Monitor de Uso (Reportes → Monitor de uso).
 * Puro: mismo input siempre produce el mismo texto. Nunca usa IA — el propósito de esta
 * vista es auditar quién dejó de usar el sistema, así que no puede inventar nombres ni
 * cifras. Ver src/utils/aggregateUsageMonitor.js para el shape de `lineResult`.
 */
import { USAGE_MODULES } from './aggregateUsageMonitor'
import { MONTHS } from '../components/metricas/constants'

function joinNatural(items) {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} y ${items[1]}`
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

/**
 * @param {object} lineResult - una entrada de aggregateUsageMonitor(...).byLine
 * @param {number} prevMonthNumber - 1-indexado, el mes inmediatamente anterior al visible
 * @returns {string} 2-3 frases en texto corrido
 */
export function buildUsageNarrative(lineResult, prevMonthNumber) {
  const { lineName, lead, counts, total, members, external, prevMonth } = lineResult
  const sentences = []

  if (!lead) {
    return `${lineName} no tiene una jefa de línea asignada, así que no hay actividad que auditar.`
  }

  // ── Aporte del equipo ──────────────────────────────────────────────────────
  const contributingMembers = members.filter((m) => m.total > 0).sort((a, b) => b.total - a.total)

  if (contributingMembers.length === 0) {
    sentences.push('Ningún miembro del equipo registró actividad este mes.')
  } else if (contributingMembers.length === 1) {
    const m = contributingMembers[0]
    sentences.push(
      `En ${lineName}, ${m.name} es la única del equipo con actividad — aportó ${m.total} acciones adicionales.`,
    )
  } else {
    const names = joinNatural(contributingMembers.map((m) => m.name))
    sentences.push(`En ${lineName}, ${names} aportaron actividad además de ${lead.name}.`)
  }

  // ── Módulos en cero ──────────────────────────────────────────────────────
  const zeroModules = USAGE_MODULES.filter((m) => counts[m.key] === 0)
  if (zeroModules.length > 0) {
    const labels = joinNatural(zeroModules.map((m) => `cero en ${m.label.toLowerCase()}`))
    sentences.push(`El equipo tiene ${labels}.`)
  } else {
    // ── Módulo más fuerte (solo se destaca si no hay ceros que contar) ──────
    const strongest = [...USAGE_MODULES].sort((a, b) => counts[b.key] - counts[a.key])[0]
    if (strongest && counts[strongest.key] > 0) {
      sentences.push(`El equipo concentra su uso en ${strongest.label.toLowerCase()}.`)
    }
  }

  // ── Caídas mes a mes ────────────────────────────────────────────────────
  const prevMonthLabel = MONTHS[prevMonthNumber - 1] ?? ''
  const drops = USAGE_MODULES.filter(
    (m) => prevMonth[m.key] >= 3 && counts[m.key] < prevMonth[m.key] * 0.6,
  )
  if (drops.length > 0) {
    const d = drops[0]
    sentences.push(
      `${d.label} cayó de ${prevMonth[d.key]} en ${prevMonthLabel} a ${counts[d.key]} este mes.`,
    )
  }

  // ── Apoyo externo ───────────────────────────────────────────────────────
  if (external.length > 0) {
    const names = joinNatural(external.map((e) => `${e.name} (${e.total})`))
    sentences.push(
      `Además, ${names} registró actividad en esta línea sin ser miembro formal del equipo (apoyo externo).`,
    )
  }

  return sentences.join(' ')
}
