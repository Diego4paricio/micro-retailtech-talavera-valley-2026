import { contactMessage } from "@/content/landing";
import { whatsappLink } from "@/lib/site";
import { WhatsAppIcon } from "./ui";

/** WhatsApp's own green: the one color outside the palette, so it is recognized. */
export function WhatsAppFloat() {
  return (
    <a
      aria-label="Escríbenos por WhatsApp"
      className="fixed right-5 bottom-5 z-40 flex size-14 items-center justify-center rounded-full bg-whatsapp text-white shadow-lg shadow-black/25 transition-colors hover:bg-whatsapp-hover sm:right-6 sm:bottom-6"
      href={whatsappLink(contactMessage)}
      rel="noopener noreferrer"
      target="_blank"
    >
      <WhatsAppIcon className="size-7" />
    </a>
  );
}
