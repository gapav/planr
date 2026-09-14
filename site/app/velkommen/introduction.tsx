"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowDown, ArrowRight, Laptop, MailCheck, Smartphone } from "lucide-react";
import { CourtArtwork } from "@/components/court-artwork";
import { LogoArtwork } from "@/components/logo";
import styles from "./introduction.module.css";
import { InterestForm } from "./interest-form";
import { MailPreview } from "./mail-preview";

export function GrepIntroduction() {
  const page = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!page.current || typeof IntersectionObserver === "undefined" || typeof window.matchMedia !== "function") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    // Browsers with scroll timelines run the reveal from CSS, together with the hero
    // dissolve and the phone parallax; this observer is the fallback for the rest.
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("animation-timeline: view()")) return;
    const animations: Animation[] = [];
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (!preference.matches && typeof entry.target.animate === "function") {
          animations.push(entry.target.animate(
            [{ opacity: .15, transform: "translateY(28px)" }, { opacity: 1, transform: "translateY(0)" }],
            { duration: 750, easing: "cubic-bezier(.2,.7,.2,1)" },
          ));
        }
        observer.unobserve(entry.target);
      });
    }, { threshold: .08 });
    page.current.querySelectorAll("[data-reveal]").forEach(element => observer.observe(element));
    const stopMotion = () => { if (preference.matches) { observer.disconnect(); animations.forEach(animation => animation.cancel()); } };
    preference.addEventListener("change", stopMotion);
    return () => { observer.disconnect(); animations.forEach(animation => animation.cancel()); preference.removeEventListener("change", stopMotion); };
  }, []);

  return <main ref={page} className={styles.page} id="topp">
    <a className={styles.skip} href="#slik-fungerer-det">Hopp til presentasjonen</a>
    <header className={styles.header}>
      <a href="#topp" aria-label="Grep – introduksjon" className={styles.logo}><LogoArtwork /></a>
      <nav aria-label="Introduksjon" className={styles.navigation}>
        <a href="#slik-fungerer-det">Slik fungerer det</a>
        <a href="#interesse" className={styles.tryLink}>Prøv Grep</a>
        <Link href="/sign-in" className={styles.login}>Logg inn <ArrowRight size={17} aria-hidden /></Link>
      </nav>
    </header>
    <section className={styles.hero} aria-labelledby="intro-heading">
      <div>
        <p className={styles.eyebrow}>ET LITE GREP. EN GOD ØKT.</p>
        <h1 id="intro-heading">Mer tid<br />til <span>laget.</span></h1>
        <p className={styles.lead}>Planlegg hjemme.<br />Vær til stede på trening.</p>
        <p className={styles.description}>Øvelsene, trenerteamet og øktplanen på samme sted. Laget ditt trenger deg mer enn enda en app som tar tid.</p>
        <div className={styles.heroActions}>
          <a href="#interesse" className={styles.primary}>Prøv Grep med laget ditt <ArrowRight size={20} aria-hidden /></a>
          <a href="#slik-fungerer-det" className={styles.exploreLink}>Bli kjent med Grep <ArrowDown size={18} aria-hidden /></a>
        </div>
      </div>
      <div className={styles.heroVisual}>
        <div className={styles.court}><CourtArtwork /></div>
        <figure className={styles.realPreview}>
          <div className={styles.previewBar}><span>En god plan starter her</span><Laptop size={18} aria-hidden /></div>
          <Image src="/intro/overview-current-demo.png" alt="Grep Oversikt på desktop, med neste trening, kampdag og månedens fokus." width={3584} height={1852} priority sizes="(max-width: 760px) 94vw, 53vw" />
          <figcaption>Neste økt. Neste kamp. Ett sted.</figcaption>
        </figure>
      </div>
    </section>
    <section className={styles.exerciseSection} id="slik-fungerer-det" aria-labelledby="exercise-heading">
      <div className={styles.sectionHeading} data-reveal>
        <div><p className={styles.eyebrow}>01 / FINN INSPIRASJON</p><h2 id="exercise-heading">En god idé.<br />Så er du i gang.</h2></div>
        <p>Finn øvelser til alderen og temaet dere jobber med fra åpne, eksisterende øvelsesbanker, eller legg til deres egne. Ta vare på favorittene, og bruk dem igjen når de passer.</p>
      </div>
      <figure className={styles.exerciseFrame} data-reveal>
        <Image src="/intro/exercises-illustrative-v2.png" alt="Eksempelvisning av Greps øvelsesbank med aldersfiltre, temaer og illustrerte øvelseskort, blant annet to genererte videominiatyrer." width={1419} height={1109} sizes="(max-width: 760px) 94vw, 90vw" />
        <figcaption> </figcaption>
      </figure>
    </section>
    <section className={styles.planSection} aria-labelledby="plan-heading">
      <div className={styles.planCopy} data-reveal>
        <p className={styles.eyebrow}>02 / PLANLEGG SAMMEN</p>
        <h2 id="plan-heading">Litt mindre<br />«hvem tar hva?»</h2>
        <p>Bygg økten med oppvarming, hoveddel og avslutning. Legg inn øvelser og korte notater, og fordel ansvaret i trenerteamet.</p>
        <div className={styles.deviceNote}><Laptop size={23} aria-hidden /><span>God plass til å planlegge.<br /><strong>Best på en stor skjerm.</strong></span></div>
      </div>
      <figure className={styles.planFrame} data-reveal>
        <Image src="/intro/planning-demo.png" alt="Grep øktplanlegger: oppvarmingsbolk med øvelser, treneransvar og menyen for å legge til en ny bolk." width={2088} height={1608} sizes="(max-width: 760px) 90vw, 57vw" />
        <figcaption>En felles plan. Et samkjørt trenerteam.</figcaption>
      </figure>
    </section>
    <section className={styles.mailSection} aria-labelledby="mail-heading">
      <div className={styles.mailCopy} data-reveal>
        <p className={styles.eyebrow}>03 / FÅ PLANEN PÅ E-POST</p>
        <h2 id="mail-heading">Treningsdag?<br /><span>Planen ligger klar.</span></h2>
        <div className={styles.toggleShot} role="img" aria-label="Innstillingen «Dagens økt på e-post» i Grep, med en bryter som slås av og på.">
          <div className={styles.digestHead}>
            <span className={styles.digestIcon}><MailCheck size={20} aria-hidden /></span>
            <div>
              <strong>Dagens økt på e-post</strong>
              <p>Hele planen i innboksen om morgenen på dager du har økt. Ingen økt, ingen e-post.</p>
            </div>
          </div>
          <div className={styles.digestRow}>
            <span className={styles.digestState}><span>På</span><span>Av</span></span>
            <span className={styles.digestSwitch}><span /></span>
          </div>
        </div>
        <p>Morgenen på treningsdagen får trenerteamet en oppsummering av dagens økt på mail. Du ser hvem som har ansvar for hva, og hvor lenge hver bolk varer.</p>
      </div>
      <MailPreview />
    </section>
    <section className={styles.mobileSection} aria-labelledby="mobile-heading">
      <div className={styles.mobileCopy} data-reveal>
        <p className={styles.eyebrow}>04 / TA PLANEN MED</p>
        <h2 id="mobile-heading">Planen i lomma.<br /><span>Blikket på laget.</span></h2>
        <p>Når dere møtes på banen, ligger økten klar i appen for hele teamet. Registrer oppmøte, generer laginndeling og følg planen, én bolk om gangen.</p>
        <div className={styles.deviceNote}><Smartphone size={23} aria-hidden /><span>Enklere når treningen er i gang.<br /><strong>Laget for mobilen på banen.</strong></span></div>
      </div>
      <div className={styles.phonePair}>
        <figure className={styles.preparePhone} data-reveal>
          <span className={styles.phoneShot}><Image src="/intro/groups-v2.png" alt="Grep på mobil: klargjør økten ved å velge lag eller par og generere grupper." width={1000} height={1374} sizes="(max-width: 760px) 45vw, 25vw" /></span>
          <figcaption>Før fløyta går.</figcaption>
        </figure>
        <figure className={styles.livePhone} data-reveal>
          <span className={styles.phoneShot}><Image src="/intro/live-demo-v2.png" alt="En pågående økt i Grep på mobil, med oppvarming, øvelser, treneransvar og Neste-knapp." width={1000} height={1374} sizes="(max-width: 760px) 45vw, 25vw" /></span>
          <figcaption>Og mens økten pågår.</figcaption>
        </figure>
      </div>
    </section>
    <section className={styles.interestSection} id="interesse" aria-labelledby="interest-heading">
      <div className={styles.interestCopy}>
        <p className={styles.eyebrow}> TA GREP FOR LAGET DITT</p>
        <h2 id="interest-heading">Nysgjerrig?<br />Send oss en melding!</h2>
        <p>Du trenger ikke en invitasjon for å melde interesse. Send oss bare en melding, så tar vi kontakt om å prøve Grep.</p>
        <span className={styles.interestTag}>Mer tid til laget. Sammen.</span>
      </div>
      <InterestForm />
    </section>
    <section className={styles.closing} aria-labelledby="closing-heading" data-reveal>
      <div className={styles.signature}><LogoArtwork /><h2 id="closing-heading">Små ideer.<br />Gode økter.</h2></div>
      <div><p>Har du fått en invitasjon til Grep?</p><p>Åpne lenken i e-posten for å bli med på laget. Er du allerede med, kan du logge inn her.</p><Link href="/sign-in" className={styles.primary}>Logg inn i Grep <ArrowRight size={18} aria-hidden /></Link></div>
    </section>
    <footer className={styles.footer}><span>Grep · Laget for trenerhverdagen.</span><a href="#topp">Til toppen ↑</a></footer>
  </main>;
}
