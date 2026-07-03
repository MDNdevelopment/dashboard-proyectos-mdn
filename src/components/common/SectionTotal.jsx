/**
 * Leyenda de conteo al final de una sección de lista.
 * Ejemplo: <SectionTotal label="marcas" count={13} />  →  "Total marcas: 13"
 */
export default function SectionTotal({ label, count }) {
  return (
    <div className="pt-2 mt-1 border-t border-[#f0ede3] text-[12px] font-mono text-[#888] text-right">
      Total {label}:{" "}
      <span className="font-bold text-[#555]">{count}</span>
    </div>
  );
}
