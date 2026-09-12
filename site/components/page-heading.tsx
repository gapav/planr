import type { ReactNode } from "react";
import { LogoArtwork } from "./logo";

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="grep-page-heading"><div className="grep-heading-copy"><p className="grep-eyebrow"><LogoArtwork compact />{eyebrow}</p><h1>{title}</h1><p className="grep-page-description">{description}</p></div>{actions && <div className="grep-page-actions">{actions}</div>}</header>;
}
