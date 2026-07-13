/**
 * Celda de cliente para las tablas de Tácticas y Ads: logo circular (o
 * inicial si no hay logo) + nombre. Extraído de AdsCard.jsx para no
 * duplicarlo en AdsSpendView.jsx.
 */
export default function ClientCell({ name, logoUrl }) {
  if (!name) return <span className="text-[#bbb]">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          className="w-5 h-5 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]"
        />
      ) : (
        <span className="w-5 h-5 rounded-full bg-[#f0ede3] flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#aaa] uppercase">
          {name[0]}
        </span>
      )}
      <span>{name}</span>
    </div>
  );
}
