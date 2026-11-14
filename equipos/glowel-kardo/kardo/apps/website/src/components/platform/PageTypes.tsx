import { pageKinds } from "@/content/landing";
import { KardoPage } from "../kardo-page/KardoPage";
import { presetThemes } from "../kardo-page/theme";
import { examples, RedirectSketch, Screen } from "../sections/Pages";
import "@/app/kardo-page.css";

/*
  The eight page types with the port of the Resolver's templates
  (components/kardo-page), each on a different preset theme of the panel
  and a different business, laid out in the editorial style.
*/
export function PageTypes() {
  return (
    <ul className="page-types">
      {pageKinds.map((kind) => {
        const example = kind.id === "redirect" ? null : examples[kind.id];
        return (
          <li key={kind.id}>
            <div className="page-type-screen">
              {example ? (
                <Screen>
                  <KardoPage
                    content={example.content}
                    theme={presetThemes[example.theme]}
                  />
                </Screen>
              ) : (
                <RedirectSketch />
              )}
            </div>
            <h3>{kind.name}</h3>
            <p>{kind.text}</p>
          </li>
        );
      })}
    </ul>
  );
}
