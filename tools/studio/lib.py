"""Building blocks for the SWK Document Studio library. Every template is assembled from the same parts so
headings, numbering, tables and signature blocks look identical across the whole library."""
import html as _h

def esc(s): return _h.escape(s, quote=False)

def head(kicker, title, meta=None, lead=None):
    meta = meta if meta is not None else [("Reference", "[Reference no.]"), ("Date", "{{today}}")]
    rows = "".join(f"<tr><th>{esc(k)}</th><td>{v}</td></tr>" for k, v in meta)
    out = f'<p class="kicker">{esc(kicker)}</p><h1>{esc(title)}</h1>'
    if meta: out += f'<table class="fields doc-meta"><tbody>{rows}</tbody></table>'
    if lead: out += f'<p class="lead">{lead}</p>'
    return out

def fields(rows, title=None):
    t = f"<h2>{esc(title)}</h2>" if title else ""
    return t + '<table class="fields"><tbody>' + "".join(f"<tr><th>{esc(k)}</th><td>{v}</td></tr>" for k, v in rows) + "</tbody></table>"

def table(headers, rows, title=None):
    t = f"<h2>{esc(title)}</h2>" if title else ""
    th = "".join(f"<th>{esc(h)}</th>" for h in headers)
    tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f"{t}<table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>"

def checklist(items, title=None, cols=("Item", "Done", "Notes")):
    return table(list(cols), [[esc(i), "☐", ""] for i in items], title)

def clauses(items, start=1):
    """items: list of (heading, [paragraph, ...]). Rendered as numbered sections 1., 1.1, 1.2 …"""
    out = []
    for n, (heading, paras) in enumerate(items, start):
        out.append(f"<h2>{n}. {esc(heading)}</h2>")
        for k, p in enumerate(paras, 1):
            out.append(f"<p><b>{n}.{k}</b>&nbsp; {p}</p>" if len(paras) > 1 else f"<p>{p}</p>")
    return "".join(out)

def paras(*ps): return "".join(f"<p>{p}</p>" for p in ps)

def bullets(items, title=None):
    t = f"<h2>{esc(title)}</h2>" if title else ""
    return t + "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"

def sig(parties, title="Signatures"):
    cells = "".join(f'<td><div class="sig-line"></div><b>{esc(p)}</b><br><span class="small muted">Name: [Name] &nbsp;·&nbsp; Date: [Date]</span></td>' for p in parties)
    rows, per = [], 2
    names = parties
    for i in range(0, len(names), per):
        chunk = "".join(f'<td><div class="sig-line"></div><b>{esc(p)}</b><br><span class="small muted">Name: [Name] &nbsp;·&nbsp; Date: [Date]</span></td>' for p in names[i:i + per])
        if len(names[i:i + per]) < per: chunk += "<td></td>"
        rows.append(f"<tr>{chunk}</tr>")
    return f'<h2 class="keep">{esc(title)}</h2><table class="sig keep"><tbody>{"".join(rows)}</tbody></table>'

def company_sig(extra=None):
    return sig(["For and on behalf of {{company.name}}"] + (extra or []))

def note(text): return f'<p class="note guidance">{text}</p>'

def letter(title, to, subject, body_paras, sign_as="[Name]<br>[Designation]", cc=None, ref=True):
    meta = [("Reference", "[Reference no.]"), ("Date", "{{today}}")] if ref else [("Date", "{{today}}")]
    rows = "".join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in meta)
    out = f'<table class="fields doc-meta"><tbody>{rows}</tbody></table>'
    out += f'<p class="small muted">To</p><p><b>{to}</b></p>'
    out += f'<p><b>Subject: {esc(subject)}</b></p>'
    out += "".join(f"<p>{p}</p>" for p in body_paras)
    out += f'<p>Yours sincerely,</p><div class="sig-line" style="width:45%"></div><p><b>{sign_as}</b><br>{{{{company.name}}}}</p>'
    if cc: out += f'<p class="small muted">cc: {cc}</p>'
    return out

PARTY_IND = ["Full name (as per passport)", "Nationality", "Passport no.", "Emirates ID no.", "Mobile", "E-mail", "Address"]
PARTY_CO = ["Company name", "Trade licence no. & issuing authority", "Registered address", "Authorised signatory", "Mobile", "E-mail"]
def party_block(role, kind="ind"):
    rows = [(k, f"[{role} – {k.lower()}]") for k in (PARTY_IND if kind == "ind" else PARTY_CO)]
    return fields(rows, role)

BROKER = fields([
    ("Brokerage", "{{company.name}}"), ("DET Trade Licence No.", "{{company.trade_license}}"), ("RERA ORN", "{{company.orn}}"),
    ("Office", "{{company.address}}"), ("Telephone / WhatsApp & e-mail", "{{company.phone}} · {{company.email}}"),
    ("Website", "{{company.website}}"), ("Agent name & BRN", "[Agent name] · BRN [000000]"),
], "Broker")

PROPERTY = lambda title="Property": fields([
    ("Community / project", "[Community]"), ("Building / villa", "[Building]"), ("Unit no.", "[Unit]"),
    ("Property type", "[Apartment / Villa / Townhouse / Office]"), ("Size", "[0,000] sq ft"), ("Title deed / Oqood no.", "[Number]"),
    ("Plot no. / Makani", "[Plot] · [Makani]"),
], title)
