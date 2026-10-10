/**
 * Save as stamp (2026-10-10): a name and tags. Four quick tags (the author's: Foliage, Ground, Props, Walls) and
 * any tags of your own; the stamps strip filters by them. Tags live in the stamp's own sidecar (Cartographer/stamps/
 * <name>.png.json), never in GB Studio's files.
 */
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button, Chip, Dialog, Field } from "../ui/kit";
import "./SaveStampDialog.css";

export const QUICK_TAGS = ["Foliage", "Ground", "Props", "Walls"];

export interface StampSave { name: string; tags: string[] }

export function SaveStampDialog({ hint, known, onClose, onSave }: { hint: string; /** Tags already used in this project (shown after the quick ones). */ known: string[]; onClose: () => void; onSave: (save: StampSave) => void }) {
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [own, setOwn] = useState("");
  const text = name.trim();
  const toggle = (tag: string) => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  const addOwn = () => { const tag = own.trim().slice(0, 24); if (tag && !tags.includes(tag)) setTags([...tags, tag]); setOwn(""); };
  const offered = [...QUICK_TAGS, ...known.filter((tag) => !QUICK_TAGS.includes(tag))];
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Save as stamp"
      footer={<><span className="k-spacer" /><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!text} onClick={() => onSave({ name: text, tags })}>Save stamp</Button></>}>
      <form className="k-stack" onSubmit={(event) => { event.preventDefault(); if (text) onSave({ name: text, tags }); }}>
        <Field label="Name" hint={hint}><input className="k-input" autoFocus value={name} placeholder="e.g. Cabin bed" onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Tags" hint="Pick any that fit, or add your own; the stamps strip filters by them">
          <div className="ssd-tags" role="group" aria-label="Tags">
            {offered.map((tag) => <button key={tag} type="button" className="k-btn k-btn--sm ssd-tag" aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)}>{tag}</button>)}
            {tags.filter((tag) => !offered.includes(tag)).map((tag) => <Chip key={tag} tone="acc">{tag} <button type="button" className="ssd-remove" aria-label={`Remove ${tag}`} onClick={() => toggle(tag)}><X size={10} /></button></Chip>)}
          </div>
          <div className="k-row">
            <input className="k-input ssd-own" aria-label="Your own tag" placeholder="Your own tag" value={own} maxLength={24} onChange={(event) => setOwn(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOwn(); } }} />
            <Button size="sm" icon={<Plus />} disabled={!own.trim()} onClick={addOwn}>Add</Button>
          </div>
        </Field>
      </form>
    </Dialog>
  );
}
