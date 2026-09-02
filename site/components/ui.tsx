"use client";

import { X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  return <button className={cn("inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45", size === "sm" && "min-h-9 px-3 text-sm", size === "md" && "min-h-11 px-4 text-sm", size === "lg" && "min-h-12 px-5", variant === "primary" && "bg-[var(--orange)] text-white shadow-[0_8px_20px_rgba(240,100,46,.22)] enabled:hover:bg-[var(--orange-dark)]", variant === "secondary" && "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] enabled:hover:border-[var(--ink)]", variant === "ghost" && "text-[var(--ink-soft)] enabled:hover:bg-black/5 enabled:hover:text-[var(--ink)]", variant === "danger" && "bg-red-50 text-[var(--danger)] enabled:hover:bg-red-100", className)} {...props} />;
}

export function Modal({ open, title, description, children, onClose, size = "md" }: { open: boolean; title: string; description?: string; children: ReactNode; onClose(): void; size?: "sm" | "md" | "lg" }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-end bg-[#10201d]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="modal-title" className={cn("max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--surface)] p-5 shadow-2xl soft-in sm:rounded-[28px] sm:p-7", size === "sm" && "sm:max-w-md", size === "md" && "sm:max-w-xl", size === "lg" && "sm:max-w-3xl")}>
      <div className="mb-6 flex items-start justify-between gap-5"><div><h2 id="modal-title" className="text-2xl font-black tracking-[-.04em]">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{description}</p>}</div><Button variant="ghost" size="sm" aria-label="Close dialog" onClick={onClose} className="-mr-2"><X size={19} /></Button></div>
      {children}
    </section>
  </div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="grid gap-2 text-sm font-semibold"><span>{label}</span>{children}{hint && <span className="text-xs font-normal text-[var(--ink-soft)]">{hint}</span>}</label>;
}

export const inputClass = "min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 text-[15px] text-[var(--ink)] shadow-sm transition placeholder:text-[#8b9692] hover:border-[#aaa69b] focus:border-[var(--orange)] focus:outline-none";
export const textareaClass = `${inputClass} min-h-28 resize-y py-3 leading-6`;

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "orange" | "green" | "blue" }) {
  return <span className={cn("inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-bold", tone === "neutral" && "bg-black/5 text-[var(--ink-soft)]", tone === "orange" && "bg-[#fde1d5] text-[#9c3913]", tone === "green" && "bg-[#dcecdf] text-[#285546]", tone === "blue" && "bg-[#dceaf3] text-[#315c73]")}>{children}</span>;
}

export function Avatar({ name, initials, color, size = "md" }: { name: string; initials: string; color: string; size?: "sm" | "md" | "lg" }) {
  return <span title={name} aria-label={name} className={cn("inline-grid shrink-0 place-items-center rounded-full border-2 border-[var(--surface)] font-black text-white shadow-sm", size === "sm" && "h-7 w-7 text-[10px]", size === "md" && "h-9 w-9 text-xs", size === "lg" && "h-11 w-11 text-sm")} style={{ backgroundColor: color }}>{initials}</span>;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <div className="grid min-h-72 place-items-center rounded-[24px] border border-dashed border-[#c8c3b7] bg-white/45 px-6 text-center"><div className="max-w-sm"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--paper-deep)]">{icon}</div><h3 className="text-lg font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{body}</p>{action && <div className="mt-5">{action}</div>}</div></div>;
}
