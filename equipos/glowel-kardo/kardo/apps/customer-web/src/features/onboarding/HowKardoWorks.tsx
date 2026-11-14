import { useEffect, useState } from "react";
import { Dialog } from "../../components/Dialog.js";
import { Icon, type IconName } from "../../components/Icon.js";
import { useRouter } from "../../lib/router.js";

/**
 * «Cómo funciona Kardo»: four cards, one idea each, in the owner's words.
 * Since relevo 37 (D2) the panel says «Páginas» and «QR y etiquetas»
 * instead of Experience and Touchpoint (15 and 12 of 20 owners did not
 * understand them even with this tour); the cards point to those sections.
 * Opened from the Primeros pasos guide, its page and Ayuda.
 */
const KARDO_TOUR_EVENT = "kardo:how-it-works";

export function openKardoTour() {
  window.dispatchEvent(new Event(KARDO_TOUR_EVENT));
}

const cards: { icon: IconName; title: string; text: string; term?: string }[] =
  [
    {
      icon: "experience",
      title: "Tu página",
      text: "Lo que ve tu cliente en su celular: tu menú, tus servicios o tu catálogo, con tu WhatsApp.",
      term: "Las encuentras en «Páginas».",
    },
    {
      icon: "qr",
      title: "Tu QR",
      text: "Lo que tus clientes escanean o tocan: el QR de tus mesas, una etiqueta NFC o un link para Instagram. Si cambias tu página, el QR sigue igual.",
      term: "Los encuentras en «QR y etiquetas».",
    },
    {
      icon: "availability",
      title: "Siempre al día",
      text: "¿Se acabó algo? Márcalo en Disponibilidad y tus clientes lo ven al instante, sin volver a publicar.",
    },
    {
      icon: "analytics",
      title: "Cuánta gente te ve",
      text: "En Analítica ves cuántas personas escanean tu QR y qué botones tocan.",
    },
  ];

export function KardoTourHost({
  firstStepsPending,
}: {
  /** The last card offers to start (or continue) Primeros pasos. */
  firstStepsPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const { navigate } = useRouter();

  useEffect(() => {
    function show() {
      setIndex(0);
      setOpen(true);
    }
    window.addEventListener(KARDO_TOUR_EVENT, show);
    return () => window.removeEventListener(KARDO_TOUR_EVENT, show);
  }, []);

  const card = cards[index] ?? cards[0];
  const last = index === cards.length - 1;
  if (!card) return null;

  return (
    <Dialog
      footer={
        <>
          {index > 0 ? (
            <button
              className="button button-secondary"
              onClick={() => setIndex(index - 1)}
              type="button"
            >
              Anterior
            </button>
          ) : null}
          {last ? (
            <button
              className="button button-primary"
              onClick={() => {
                setOpen(false);
                if (firstStepsPending) navigate({ name: "first-steps" });
              }}
              type="button"
            >
              {firstStepsPending ? "Seguir con mis primeros pasos" : "Listo"}
            </button>
          ) : (
            <button
              className="button button-primary"
              onClick={() => setIndex(index + 1)}
              type="button"
            >
              Siguiente
            </button>
          )}
        </>
      }
      onClose={() => setOpen(false)}
      open={open}
      title="Cómo funciona Kardo"
    >
      <div className="hkw" aria-live="polite">
        <span aria-hidden="true" className="hkw-icon">
          <Icon name={card.icon} size={30} />
        </span>
        <h3 className="hkw-title">{card.title}</h3>
        <p className="hkw-text">{card.text}</p>
        {card.term ? <p className="hkw-term">{card.term}</p> : null}
        <ol
          aria-label={`Tarjeta ${index + 1} de ${cards.length}`}
          className="hkw-dots"
        >
          {cards.map((item, dot) => (
            <li key={item.title}>
              <button
                aria-current={dot === index ? "step" : undefined}
                aria-label={`Ir a «${item.title}»`}
                className="hkw-dot"
                onClick={() => setIndex(dot)}
                type="button"
              />
            </li>
          ))}
        </ol>
      </div>
    </Dialog>
  );
}
