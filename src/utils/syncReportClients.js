/**
 * Reconcilia los items de crecimiento, pautas y feedback de un reporte
 * con la cartera actual de clientes de la línea.
 *
 * - Conserva los items existentes (por clienteId) con sus valores ya ingresados.
 * - Agrega items nuevos para clientes que no están en el reporte.
 * - Descarta items de clientes que ya no pertenecen a la línea.
 *
 * @param {object} reportData  - Objeto data del reporte (mutación en copia).
 * @param {Array}  lineClients - Array de { id, name } de la cartera actual.
 * @returns {object} - Nueva copia del reportData con los items sincronizados.
 */
export function syncReportClients(reportData, lineClients) {
  const data = structuredClone(reportData);
  const clientIds = new Set(lineClients.map(c => c.id));

  // ── crecimiento ──────────────────────────────────────────────────────────────
  {
    const existing = data.crecimiento?.items ?? [];
    const existingMap = Object.fromEntries(existing.map(i => [i.clienteId, i]));
    data.crecimiento = {
      ...data.crecimiento,
      items: lineClients.map(c =>
        existingMap[c.id] ?? {
          clienteId: c.id,
          seguidoresActuales: null,
          seguidoresBase: null,
          meta: 0,
        }
      ).filter(i => clientIds.has(i.clienteId)),
    };
  }

  // ── pautas ───────────────────────────────────────────────────────────────────
  {
    const existing = data.pautas?.items ?? [];
    const existingMap = Object.fromEntries(existing.map(i => [i.clienteId, i]));
    data.pautas = {
      ...data.pautas,
      items: lineClients.map(c =>
        existingMap[c.id] ?? {
          clienteId: c.id,
          realizadas: 0,
          meta: 0,
        }
      ).filter(i => clientIds.has(i.clienteId)),
    };
  }

  // ── feedback ─────────────────────────────────────────────────────────────────
  {
    const existing = data.feedback?.items ?? [];
    const existingMap = Object.fromEntries(existing.map(i => [i.clienteId, i]));
    data.feedback = {
      ...data.feedback,
      items: lineClients.map(c =>
        existingMap[c.id] ?? {
          clienteId: c.id,
          score: null,
        }
      ).filter(i => clientIds.has(i.clienteId)),
    };
  }

  // ── ingresos ─────────────────────────────────────────────────────────────────
  // Las filas ligadas a cliente (clienteId != null) se sincronizan con la cartera:
  //   - Preserva montos ya editados por clienteId.
  //   - Agrega clientes nuevos con su monthly_fee como monto por defecto.
  //   - Descarta clientes que ya no están en la línea.
  // Las filas manuales (clienteId == null) se conservan intactas.
  {
    const existing = data.finanzas?.ingresos ?? [];
    const manual = existing.filter(i => i.clienteId == null);
    const byClient = Object.fromEntries(
      existing.filter(i => i.clienteId != null).map(i => [i.clienteId, i])
    );
    const clientRows = lineClients.map(c =>
      byClient[c.id] ?? {
        id: 'ing-' + c.id,
        clienteId: c.id,
        descripcion: c.name,
        monto: Number(c.monthly_fee) || 0,
      }
    );
    data.finanzas = {
      ...(data.finanzas ?? { gastosOperativos: [], sueldos: [], otrosGastos: [] }),
      ingresos: [...clientRows, ...manual],
    };
  }

  return data;
}
