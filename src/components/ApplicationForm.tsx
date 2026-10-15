import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, STATUSES, type Application, type ApplicationInput, type Status } from "../api";
import { LABEL } from "../format";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

export function ApplicationForm({ initial, onSave, onCancel }: {
  initial: Application | null;
  onSave: (a: ApplicationInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ApplicationInput>({
    company: initial?.company ?? "",
    role: initial?.role ?? "",
    status: initial?.status ?? "APPLIED",
    appliedOn: initial?.appliedOn ?? today(),
    url: initial?.url ?? "",
    notes: initial?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal(); // native modal: focus trap, Escape and backdrop for free
  }, []);

  const set = <K extends keyof ApplicationInput>(k: K, v: ApplicationInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.company.trim()) e.company = "Company is required.";
    if (!form.role.trim()) e.role = "Role is required.";
    if (!form.appliedOn) e.appliedOn = "Date is required.";
    else if (form.appliedOn > today()) e.appliedOn = "Date can't be in the future.";
    if (form.url && !/^https?:\/\//i.test(form.url)) e.url = "Link must start with http:// or https://";
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await onSave({ ...form, company: form.company.trim(), role: form.role.trim(), url: form.url || null, notes: form.notes || null });
    } catch (err) {
      const api = err as ApiError;
      setErrors(api.fields && Object.keys(api.fields).length ? api.fields : { form: api.message });
      setSaving(false);
    }
  }

  const field = (name: keyof ApplicationInput) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-err` } : {});
  const err = (name: string) => errors[name] && <span id={`${name}-err`} className="error small">{errors[name]}</span>;

  return (
    <dialog ref={dialog} onClose={onCancel} aria-labelledby="form-title">
      <form onSubmit={submit} noValidate>
        <h2 id="form-title">{initial ? "Edit application" : "Add application"}</h2>
        <label>Company<input value={form.company} onChange={(e) => set("company", e.target.value)} maxLength={200} {...field("company")} />{err("company")}</label>
        <label>Role<input value={form.role} onChange={(e) => set("role", e.target.value)} maxLength={200} {...field("role")} />{err("role")}</label>
        <div className="row">
          <label>Status
            <select value={form.status} onChange={(e) => set("status", e.target.value as Status)}>
              {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
            </select>
          </label>
          <label>Applied on<input type="date" max={today()} value={form.appliedOn} onChange={(e) => set("appliedOn", e.target.value)} {...field("appliedOn")} />{err("appliedOn")}</label>
        </div>
        <label>Posting link (optional)<input type="url" value={form.url ?? ""} onChange={(e) => set("url", e.target.value)} maxLength={2000} {...field("url")} />{err("url")}</label>
        <label>Notes (optional)<textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></label>
        {err("form")}
        <div className="buttons">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </dialog>
  );
}
