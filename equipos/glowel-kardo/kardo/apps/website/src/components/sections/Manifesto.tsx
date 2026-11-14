import { Reveal } from "../landing/Reveal";

/*
  The manifesto of the editorial home (RediseñoKardo), back by the owner's
  request (2026-10-13): right after the two parts, before the platform.
*/
export function Manifesto() {
  return (
    <section className="editorial-manifesto" aria-labelledby="manifesto-title">
      <Reveal>
        <p className="editorial-label">
          Lo físico se queda. Lo digital evoluciona.
        </p>
        <h2 id="manifesto-title">
          Un punto físico.
          <br />
          <em>
            Información que sí
            <br />
            se mantiene al día.
          </em>
        </h2>
        <p>Tu menú de hoy. La promoción de mañana. El contacto de siempre.</p>
      </Reveal>
    </section>
  );
}
