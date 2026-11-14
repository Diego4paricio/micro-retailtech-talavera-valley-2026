import { confidence } from "@/content/landing";

export function Confidence() {
  return (
    <section
      aria-labelledby="confidence-title"
      className="editorial-section confidence-editorial"
      id="confianza"
    >
      <div className="businesses-heading">
        <h2 id="confidence-title">{confidence.title}</h2>
        <p>{confidence.lead}</p>
      </div>
      {/* Lista integrada con divisores de 1px en vez de 6 tarjetas */}
      <ol className="confidence-list">
        {confidence.items.map((item, index) => (
          <li key={item.id}>
            <span className="editorial-label">0{index + 1}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
