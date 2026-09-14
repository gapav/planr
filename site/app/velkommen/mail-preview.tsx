"use client";

import { useCallback, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { sampleDigest } from "./sample-digest";
import styles from "./introduction.module.css";

/**
 * The morning letter, shown by rendering the production email markup inside an
 * iframe. An iframe rather than inlined HTML because the letter is a whole
 * document built for mail clients — table layout, its own `<body>` background —
 * and it should be as unaffected by this page's CSS as it is by Gmail's.
 * The frame grows to the letter once it has laid out; the fallback height is
 * only what it shows before that.
 */
export function MailPreview() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(980);
  const fit = useCallback(() => {
    const document = frame.current?.contentDocument;
    if (document?.body) setHeight(document.body.scrollHeight);
  }, []);

  return <figure className={styles.mailFrame} data-reveal>
    <div className={styles.mailBar}>
      <Mail size={17} aria-hidden />
      <div>
        <strong>{sampleDigest.subject}</strong>
        <span>Grep · om morgenen</span>
      </div>
    </div>
    <iframe
      ref={frame}
      title="Eksempel på e-posten «Dagens økt», slik trenerne får den om morgenen"
      srcDoc={sampleDigest.html}
      onLoad={fit}
      scrolling="no"
      style={{ height }}
    />
  </figure>;
}
