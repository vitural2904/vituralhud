import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MagnifyingGlass } from '@phosphor-icons/react/MagnifyingGlass';
import { X } from '@phosphor-icons/react/X';
import { championById, searchChampions } from "../domain/catalog";

export function ChampionCombobox({ value, onChange, label = "Find champion" }: {
  value: string | null;
  onChange: (value: string | null) => void | Promise<void>;
  label?: string;
}) {
  const selected = value ? championById[value] : undefined;
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const canonicalValue = useRef(value);
  canonicalValue.current = value;
  const matches = useMemo(() => searchChampions(query).slice(0, 18), [query]);

  useEffect(() => setQuery(selected?.name ?? ""), [selected?.name]);
  useEffect(() => setActive(0), [query]);

  const choose = (id: string | null) => {
    try { void Promise.resolve(onChange(id)).catch(() => setQuery(canonicalValue.current ? championById[canonicalValue.current]?.name ?? '' : '')); }
    catch { setQuery(canonicalValue.current ? championById[canonicalValue.current]?.name ?? '' : ''); }
    setQuery(id ? championById[id]?.name ?? "" : "");
    setOpen(false);
  };

  return <div className="champion-search" data-open={open || undefined}>
    {selected ? <img className="champion-search__portrait" src={selected.iconUrl} alt="" /> : <MagnifyingGlass className="champion-search__icon" />}
    <input ref={inputRef} aria-label={label} aria-controls={open ? listId : undefined} aria-expanded={open} aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined} aria-autocomplete="list" role="combobox" value={query} placeholder="Find champion" onFocus={(event) => { event.currentTarget.select(); setOpen(true); }} onBlur={() => window.setTimeout(() => { setOpen(false); setQuery(canonicalValue.current ? championById[canonicalValue.current]?.name ?? '' : ''); }, 120)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
        setActive((current) => matches.length ? (current + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0);
      } else if (event.key === "Enter" && open && matches[active]) {
        event.preventDefault();
        choose(matches[active].id);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        setQuery(selected?.name ?? "");
        inputRef.current?.blur();
      }
    }} />
    {value ? <button className="champion-search__clear" type="button" aria-label={`Clear ${label}`} onPointerDown={(event) => event.preventDefault()} onClick={() => choose(null)}><X weight="bold" /></button> : null}
    {open ? <div className="champion-options" id={listId} role="listbox">
      {matches.length ? matches.map((champion, index) => <button id={`${listId}-${champion.id}`} className={index === active ? "is-active" : ""} type="button" role="option" aria-selected={champion.id === value} key={champion.id} onPointerDown={(event) => event.preventDefault()} onPointerMove={() => setActive(index)} onClick={() => choose(champion.id)}><img src={champion.iconUrl} alt="" /><span>{champion.name}</span></button>) : <div className="champion-empty">No champions found</div>}
    </div> : null}
  </div>;
}
