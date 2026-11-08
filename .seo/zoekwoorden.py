#!/usr/bin/env python3
"""
zoekwoorden.py  -  gratis zoekwoordideeën uit Google- (en optioneel Bing-) autocomplete,
in het Nederlands, met plaatsnamen en vraagwoorden. Alleen standaardbibliotheek.

Autocomplete laat zien wat mensen ECHT typen, maar geeft geen zoekvolume. Combineer met:
  - Search Console (vertoningen per zoekterm, zodra de site live is)
  - Google Ads Zoekwoordplanner (gratis met Ads-account) voor volumes
Let op: dit gebruikt een onofficieel endpoint. Rustig gebruiken (er zit een pauze in).
Draai het op je eigen computer (de cloud-sandbox kan Google niet bereiken).

    python3 .seo/zoekwoorden.py "hovenier" --plaatsen Dordrecht Zwijndrecht --out zoekwoorden.md
    python3 .seo/zoekwoorden.py "tuinaanleg" "bestrating" --config seo.config.json --bing
"""
from __future__ import annotations

VERSION = "1.1"

import argparse
import json
import time
import urllib.parse
import urllib.request
from collections import OrderedDict
from pathlib import Path

VRAGEN = ["hoe", "wat", "wat kost", "hoeveel", "waarom", "wanneer", "welke", "kan je", "is"]
MODIFIERS = ["kosten", "prijs", "per m2", "offerte", "in de buurt", "beste", "goedkoop", "ervaringen",
             "laten", "zelf", "ideeën", "voorbeelden", "vergunning", "subsidie", "onderhoud", "openingstijden",
             "reserveren", "menu", "aanbieding"]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"


def google(q: str) -> list[str]:
    url = "https://suggestqueries.google.com/complete/search?" + urllib.parse.urlencode(
        {"client": "firefox", "hl": "nl", "gl": "nl", "q": q})
    try:
        data = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=15).read().decode("utf-8", "ignore"))
        return [s for s in data[1] if isinstance(s, str)]
    except Exception:
        return []


def bing(q: str) -> list[str]:
    url = "https://api.bing.com/osjson.aspx?" + urllib.parse.urlencode({"query": q, "market": "nl-NL"})
    try:
        data = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=15).read().decode("utf-8", "ignore"))
        return [s for s in data[1] if isinstance(s, str)]
    except Exception:
        return []


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("seeds", nargs="+", help="basistermen, bijv. 'hovenier' 'tuinonderhoud'")
    ap.add_argument("--plaatsen", nargs="*", default=[])
    ap.add_argument("--config", help="seo.config.json: neemt areaServed als plaatsen")
    ap.add_argument("--bing", action="store_true")
    ap.add_argument("--alfabet", action="store_true", help="ook seed + a..z (meer ideeën, langzamer)")
    ap.add_argument("--out")
    o = ap.parse_args()

    plaatsen = list(o.plaatsen)
    if o.config:
        biz = json.loads(Path(o.config).read_text(encoding="utf-8-sig")).get("business", {})
        plaatsen += [p for p in biz.get("areaServed", []) if p not in plaatsen]
        if biz.get("city") and biz["city"] not in plaatsen:
            plaatsen.insert(0, biz["city"])

    groups: "OrderedDict[str, OrderedDict[str, None]]" = OrderedDict()

    def collect(group: str, query: str):
        res = google(query) + (bing(query) if o.bing else [])
        g = groups.setdefault(group, OrderedDict())
        for s in res:
            g[s.lower().strip()] = None
        time.sleep(0.35)

    for seed in o.seeds:
        collect(f"{seed}: basis", seed)
        collect(f"{seed}: basis", seed + " ")
        for m in MODIFIERS:
            collect(f"{seed}: modifiers", f"{seed} {m}")
        for v in VRAGEN:
            collect(f"{seed}: vragen", f"{v} {seed}")
        for p in plaatsen:
            collect(f"{seed}: plaatsen", f"{seed} {p}")
            collect(f"{seed}: plaatsen", f"{seed} {p} ")
        if o.alfabet:
            for ch in "abcdefghijklmnopqrstuvwz":
                collect(f"{seed}: a-z", f"{seed} {ch}")

    seen = set()
    lines = ["# Zoekwoordideeën (autocomplete, geen volumes)", ""]
    for g, items in groups.items():
        uniq = [k for k in items if k not in seen]
        seen |= set(uniq)
        if uniq:
            lines.append(f"## {g} ({len(uniq)})")
            lines += [f"- {k}" for k in uniq]
            lines.append("")
    if len(seen) == 0:
        lines.append("_Geen resultaten: geen internet, of het endpoint blokkeert. Draai dit op je eigen computer._")
    text = "\n".join(lines)
    if o.out:
        Path(o.out).write_text(text, encoding="utf-8")
        print(f"{len(seen)} ideeën naar {o.out}")
    else:
        print(text)


if __name__ == "__main__":
    main()
