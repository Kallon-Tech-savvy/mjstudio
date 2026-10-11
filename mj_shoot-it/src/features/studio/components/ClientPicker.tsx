import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ClientRecord } from "@/lib/api";

/** What the photographer chose: an existing client, or a new one to be created with the gallery. */
export type ClientChoice =
  | { kind: "existing"; client: ClientRecord }
  | { kind: "new"; name: string; email?: string; phone?: string };

const EMAIL = /^\S+@\S+\.\S+$/;
const field =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-base text-inherit outline-none placeholder:text-white/40 focus:border-white/60";

type Props = {
  clients: ClientRecord[];
  value: ClientChoice | null;
  onChange: (value: ClientChoice | null) => void;
};

/**
 * Search-first client picker: type a name, pick a match, or create the client on the spot.
 * Only the name is required; email and phone/WhatsApp are optional.
 */
export function ClientPicker({ clients, value, onChange }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const trimmed = query.trim();
  const matches = useMemo(() => {
    const q = trimmed.toLowerCase();
    if (!q) return clients.slice(0, 6);
    return clients
      .filter((c) => c.name.toLowerCase().includes(q) || String(c.email ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [clients, trimmed]);
  const exact = clients.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());
  const canCreate = trimmed.length > 0 && !exact;
  const rowCount = matches.length + (canCreate ? 1 : 0);

  const pick = (client: ClientRecord) => {
    onChange({ kind: "existing", client });
    setOpen(false);
    setQuery("");
  };
  const startCreate = () => {
    setNewName(trimmed);
    setEmail("");
    setPhone("");
    setCreating(true);
    setOpen(false);
  };
  const choose = (index: number) => (index < matches.length ? pick(matches[index]) : startCreate());
  const clear = () => {
    onChange(null);
    setQuery("");
    setCreating(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(rowCount - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && open && rowCount > 0) {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  if (value) {
    const label = value.kind === "existing" ? value.client.name : value.name;
    const detail = value.kind === "existing" ? value.client.email || value.client.phone : value.email || value.phone;
    return (
      <div>
        <span className="mb-1.5 block text-sm opacity-70">Client</span>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5">
          <div className="min-w-0">
            <strong className="block truncate">{label}</strong>
            <span className="block truncate text-sm opacity-60">
              {value.kind === "new" ? "New client" : "Existing client"}
              {detail ? ` · ${detail}` : ""}
            </span>
          </div>
          <button type="button" className="shrink-0 text-sm underline opacity-80 hover:opacity-100" onClick={clear}>
            Change
          </button>
        </div>
      </div>
    );
  }

  if (creating) {
    const emailBad = email.trim() !== "" && !EMAIL.test(email.trim());
    const ready = newName.trim().length > 0 && !emailBad;
    return (
      <div className="rounded-xl border border-white/15 bg-white/5 p-4">
        <p className="mb-3 text-sm opacity-70">New client. Only the name is required.</p>
        <div className="space-y-3">
          <input className={field} aria-label="Client name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Client name" autoFocus />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <input className={field} type="email" aria-label="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" />
              {emailBad ? <p className="mt-1 text-xs text-red-300">That does not look like an email address.</p> : null}
            </div>
            <input className={field} type="tel" aria-label="WhatsApp or phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp / phone (optional)" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="primary-button"
            disabled={!ready}
            onClick={() => {
              onChange({ kind: "new", name: newName.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined });
              setCreating(false);
            }}
          >
            Use this client
          </button>
          <button type="button" className="secondary-button" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="mb-1.5 block text-sm opacity-70" htmlFor={`${listId}-input`}>
        Who is this shoot for?
      </label>
      <input
        id={`${listId}-input`}
        ref={inputRef}
        className={`${field} py-3 text-lg`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rowCount > 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Type a client name…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {open && rowCount > 0 ? (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/15 bg-slate-900 shadow-xl">
          {matches.map((client, index) => (
            <li key={client.clientId} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${index === active ? "bg-white/10" : "hover:bg-white/5"}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(client)}
              >
                <span className="truncate">{client.name}</span>
                <span className="truncate text-sm opacity-50">{client.email || client.phone || ""}</span>
              </button>
            </li>
          ))}
          {canCreate ? (
            <li id={`${listId}-${matches.length}`} role="option" aria-selected={active === matches.length}>
              <button
                type="button"
                className={`w-full px-4 py-3 text-left font-medium text-emerald-300 ${active === matches.length ? "bg-white/10" : "hover:bg-white/5"}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={startCreate}
              >
                + Create “{trimmed}” as a new client
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {clients.length === 0 && !trimmed ? <p className="mt-2 text-sm opacity-60">No clients yet. Type a name to add your first one.</p> : null}
    </div>
  );
}
