// Every explanation in the app lives here rather than inline in the pages, so
// the wording can be read and corrected as one text instead of hunted for
// across six components. Keep it describing what the app actually does — these
// are answers to "what happens if I press this", not marketing copy.
export interface HelpTopic {
  title: string;
  intro: string;
  /** Numbered when the points are a sequence, bulleted when they are just facts. */
  ordered?: boolean;
  points: string[];
  note?: string;
}

export const HELP_TOPICS = {
  "sessions-calendar": {
    title: "Slik fungerer øktkalenderen",
    intro: "Alle øktplanene til laget samles her. Hvilken fane en økt havner i, utledes av status og dato — det er ikke noe du setter selv.",
    points: [
      "Utkast er planer under arbeid. Trenerteamet ser dem, men de er ikke lagt ut som planlagte økter ennå.",
      "Kommende er publiserte økter som ikke er avsluttet. Den nærmeste ligger øverst, under «Neste økt».",
      "Gjennomførte er økter du har avsluttet. De er låst, men kan leses som dokumentasjon i ettertid.",
      "Økter lenger fram enn en uke vises som én linje. De er ikke skjult — de er bare nedtonet til du nærmer deg dem.",
    ],
    note: "«Start»-knappen dukker opp på selve treningsdagen. Resten av tiden er «Rediger» den eneste handlingen på en økt.",
  },
  "session-day": {
    title: "Hva skjer på treningsdagen",
    intro: "På dagen økten er satt opp, får den en «Start»-knapp i kalenderen. Den tar deg hit, til klargjøringen.",
    ordered: true,
    points: [
      "Registrer oppmøte: huk av hvem som er der i dag. Dette krever at spillerlisten er importert under Laginnstillinger.",
      "Generer lag eller par ut fra dem som er til stede. Endrer oppmøtet seg etterpå, må du generere på nytt før du starter.",
      "Start økten. Da låses planen: bolker og aktiviteter kan ikke endres mens økten pågår, og gruppene fryses som de er.",
      "Underveis blar du gjennom bolkene og åpner aktiviteter for å vise bilde eller video. «Avslutt økten» flytter den til Gjennomførte.",
    ],
    note: "Startet du for tidlig? «Angre start» på første bolk setter økten tilbake til klar-til-start med oppmøte og grupper i behold. Du kan også starte uten oppmøte og grupper hvis det haster.",
  },
  "session-builder": {
    title: "Slik bygger du en økt",
    intro: "En økt består av bolker, og hver bolk inneholder aktiviteter med hver sin varighet.",
    points: [
      "«Legg til bolk» gir deg ferdige navn som oppvarming og hoveddel, eller et navn du skriver selv.",
      "«Legg til øvelse» henter fra øvelsesbanken. «Egendefinert aktivitet» lager en tom aktivitet du fyller ut på stedet.",
      "Dra i håndtaket til venstre for å endre rekkefølgen på både bolker og aktiviteter.",
      "Tidskontrollen summerer aktivitetene og viser hvor mange minutter du har igjen av den planlagte varigheten.",
    ],
    note: "Alt lagres automatisk mens du skriver, og flere trenere kan redigere samtidig — du ser hvem som er inne på hvilken bolk.",
  },
  "session-publish": {
    title: "Utkast eller publisert",
    intro: "Et utkast er synlig for trenerteamet, men står ikke i kalenderen som en planlagt økt. Publisering flytter den til Kommende.",
    points: [
      "For å publisere må økten ha tittel, dato og klokkeslett, planlagt varighet og minst én bolk.",
      "Du kan fortsatt redigere en publisert økt helt fram til den startes.",
    ],
    note: "Øvelsene du legger inn er kopier. Endrer noen øvelsen i banken senere, står planen din uendret.",
  },
  "exercises-library": {
    title: "Slik legger du til en øvelse",
    intro: "Øvelsesbanken er felles for alle trenere i appen, ikke bare ditt lag. Alle kan lese den; du må være logget inn for å bidra.",
    ordered: true,
    points: [
      "Trykk «Legg til øvelse» og gi den et navn, en kategori og en beskrivelse av organisering og trenermomenter.",
      "Legg ved bilde eller video: enten en HTTPS-lenke til YouTube, Vimeo eller en videofil, eller last opp JPG, PNG, WebP eller MP4 på inntil 5 MB.",
      "Øvelsen kan brukes i økter med én gang. Dine egne øvelser kan du redigere eller arkivere senere.",
    ],
    note: "Når en øvelse legges inn i en økt, kopieres navn, beskrivelse og media inn i planen. Senere endringer i banken rører ikke økter som allerede er planlagt.",
  },
  "roster-import": {
    title: "Spillerlisten",
    intro: "Spillerlisten brukes til å registrere oppmøte og til å trekke lag eller par på treningsdagen.",
    points: [
      "Importer Excel-eksporten fra Hoopit. Du får en forhåndsvisning før noe lagres.",
      "En ny import erstatter listen, så draktnumre og navn kan oppdateres ved å importere på nytt.",
      "Uten spillerliste kan du fortsatt gjennomføre økten, men uten oppmøte og grupper.",
    ],
    note: "Av personvernhensyn lagres bare fornavn, første bokstav i etternavnet og draktnummer — både i appen og i databasen.",
  },
  "team-access": {
    title: "Hvem har tilgang til laget",
    intro: "Bare medlemmene av laget kan se lagets økter og spillerliste. Øvelsesbanken er åpen for alle.",
    ordered: true,
    points: [
      "«Inviter trener» lager en invitasjonslenke som er knyttet til én e-postadresse og utløper etter sju dager.",
      "Ingen e-post sendes automatisk. Kopier lenken og send den selv.",
      "Treneren må allerede ha en konto på den adressen og være logget inn når lenken åpnes.",
    ],
    note: "Administratorer kan invitere, endre roller og fjerne medlemmer. Trenere kan planlegge, redigere og publisere økter.",
  },
} as const satisfies Record<string, HelpTopic>;

export type HelpTopicId = keyof typeof HELP_TOPICS;
