/**
 * Barra de filtros ESTÁNDAR del sistema. Úsala en cualquier vista con filtros nueva.
 *
 * Los filtros van en COLUMNAS (una grilla), nunca uno debajo del otro: cada control
 * ocupa su celda, con su etiqueta encima, y todos quedan alineados a la misma altura.
 * El patrón viejo (`flex ... flex-wrap`) los apilaba en cuanto la pantalla se angostaba
 * y dejaba anchos desparejos según el largo del texto de cada `<option>`.
 *
 * La grilla es responsive: 2 columnas en móvil, 3 en tablet y `cols` en desktop. Las
 * clases de columnas son literales porque Tailwind no genera clases construidas por
 * interpolación (`lg:grid-cols-${n}` no existiría en el CSS final).
 *
 * Uso:
 *   <FilterBar cols={5} onClear={hasFilters ? clearFilters : undefined}>
 *     <FilterField label="Buscar">
 *       <input className="input-base text-[14px] py-1.5 w-full" … />
 *     </FilterField>
 *     <FilterField label="Tipo">
 *       <select className="input-base text-[14px] py-1.5 w-full" …>…</select>
 *     </FilterField>
 *   </FilterBar>
 *
 * Props:
 *   cols     — columnas en desktop (2-6, default 4)
 *   onClear  — si viene, muestra "Limpiar". Pásalo solo cuando haya filtros activos,
 *              para que el botón no aparezca sin nada que limpiar.
 *   children — los <FilterField>
 */
const COLS_LG = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
}

export default function FilterBar({ cols = 4, onClear, children }) {
  return (
    <div className="space-y-2">
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${COLS_LG[cols] ?? COLS_LG[4]} gap-3`}>
        {children}
      </div>
      {onClear && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClear}
            className="text-[12.5px] text-[#666] hover:text-[#111] hover:underline"
          >
            Limpiar
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Una celda de la grilla: etiqueta arriba, control abajo ocupando todo el ancho.
 * El control lo pasa el llamador (input, select, lo que sea) para no encerrar acá
 * cada variante posible; solo tiene que llevar `w-full`.
 *
 * `label` es el texto visible Y el nombre accesible del control: se asocia con el
 * `<label>` envolvente, así que el control no necesita `aria-label` aparte.
 */
export function FilterField({ label, children }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-mono font-bold tracking-[0.08em] uppercase text-[#999]">
        {label}
      </span>
      {children}
    </label>
  )
}
