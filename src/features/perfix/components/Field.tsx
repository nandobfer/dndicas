import type { ReactNode } from "react"
export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) { return <div className="space-y-1.5"><label htmlFor={id} className="text-sm font-medium">{label}</label>{children}</div> }
