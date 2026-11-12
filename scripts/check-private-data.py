"""Prüft vor einem Commit, ob Werte aus dem eigenen Datenordner (Kunden, Aufträge, Absender, Dateinamen)
im Repository stehen – im Arbeitsstand oder in irgendeinem Git-Objekt der Historie.

  python3 -I scripts/check-private-data.py "~/Library/Application Support/de.soeren3003.druckplaner/data" .

Gibt nur aus, WELCHER Wert WO vorkommt. Kurze, allgemeine Wörter (z. B. Vornamen in fremden
Lizenztexten) können als Fehltreffer auftauchen und sind dann von Hand zu bewerten.
"""
import glob
import json
import os
import re
import subprocess
import sys

data, repo = os.path.expanduser(sys.argv[1]), sys.argv[2]
SKIP = {"id", "createdAt", "updatedAt", "status", "printerId", "customerId", "unit", "material", "color", "kind", "paidAt", "date", "orderDate",
        "dueDate", "spoolWeight", "spoolPrice", "markupPercent", "weight", "minutes", "quantity", "unitPrice", "total", "net", "vat",
        "customTitle", "electricityPrice", "packaging", "shipping", "discount", "number", "fileName", "printed", "queueRank", "sentAt"}
vals = {}


def walk(v, where, key=""):
    if isinstance(v, dict):
        for k, x in v.items():
            walk(x, where, k)
    elif isinstance(v, list):
        for x in v:
            walk(x, where, key)
    elif isinstance(v, str) and key not in SKIP:
        s = v.strip()
        if len(s) >= 4:
            vals.setdefault(s, f"{where}.{key}")


for coll in ("customers", "projects", "prints"):
    for f in glob.glob(f"{data}/db/{coll}/*.json"):
        walk(json.load(open(f)), coll)
settings = f"{data}/db/settings/settings.json"
if os.path.exists(settings):
    walk(json.load(open(settings)).get("sender", {}), "settings.sender")
for f in glob.glob(f"{data}/files/*/*") + glob.glob(f"{data}/invoices/*"):
    n = os.path.basename(f)
    vals.setdefault(n, "datei")
    vals.setdefault(os.path.splitext(n)[0], "datei")
for f in glob.glob(f"{data}/db/customers/*.json"):
    for part in re.split(r"[ ,()]+", json.load(open(f)).get("name", "")):
        if len(part) >= 4:
            vals.setdefault(part, "customers.name-teil")
# Begriffe aus den Voreinstellungen der App sind keine privaten Daten
generic = open(f"{repo}/src/lib/defaults.ts", encoding="utf-8").read()
vals = {k: v for k, v in vals.items() if k not in generic}

files = subprocess.run(["git", "-C", repo, "ls-files", "-co", "--exclude-standard"], capture_output=True, text=True).stdout.split("\n")
work = {}
for f in filter(None, files):
    p = os.path.join(repo, f)
    if os.path.isfile(p):
        work[f] = open(p, encoding="utf-8", errors="ignore").read()
objs = subprocess.run(f"git -C '{repo}' rev-list --all --objects | cut -d' ' -f1 | git -C '{repo}' cat-file --batch",
                      shell=True, capture_output=True).stdout.decode("utf-8", "ignore")
logs = subprocess.run(["git", "-C", repo, "log", "--all", "--format=%an %ae %cn %ce %B"], capture_output=True, text=True).stdout

print(f"Geprüfte Werte: {len(vals)} (Kunden, Aufträge, private Drucke, Absender, Dateinamen)")
hits = 0
for v, where in sorted(vals.items(), key=lambda x: x[1]):
    w = [f for f, t in work.items() if v in t]
    o = v in objs or v in logs
    if w or o:
        hits += 1
        print(f"TREFFER [{where}] {v!r}: Arbeitsstand={w[:5]} Historie={o}")
print("Treffer:", hits)
