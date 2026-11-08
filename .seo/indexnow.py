#!/usr/bin/env python3
"""
indexnow.py  -  meldt nieuwe en gewijzigde pagina's direct bij Bing, Yandex, Seznam, Naver en Yep
via IndexNow (Google doet niet mee; die vindt wijzigingen via sitemap en crawl).

Werking: hasht elke indexeerbare HTML-pagina in dist/, vergelijkt met de vorige run
(state-bestand, in CI bewaard via actions/cache) en stuurt alleen wat nieuw, gewijzigd
of verwijderd is. Eerste run: alles.

    python3 .seo/indexnow.py --key $INDEXNOW_KEY [--wait-live] [--dry-run] [--all]

Vereist: public/<key>.txt met als inhoud precies de key (dus ook live op /<key>.txt).
Alleen standaardbibliotheek.
"""
from __future__ import annotations

VERSION = "1.1"

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def page_hash(html: str) -> str:
    # negeer build-ruis (Astro-hashes in assetnamen veranderen bij elke build)
    html = re.sub(r"/_astro/[^\"'\s)]+", "/_astro/x", html)
    html = re.sub(r"\s+", " ", html)
    return hashlib.sha256(html.encode()).hexdigest()


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default="dist")
    ap.add_argument("--config", default="seo.config.json")
    ap.add_argument("--key", required=True)
    ap.add_argument("--state", default=".indexnow-state.json")
    ap.add_argument("--all", action="store_true", help="alles insturen, state negeren")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--wait-live", action="store_true", help="wacht tot de nieuwe deploy live is (max 5 min)")
    o = ap.parse_args()

    cfg = json.loads(Path(o.config).read_text(encoding="utf-8-sig"))
    if cfg.get("mode") == "demo":
        print("Demomodus: niets insturen.")
        return
    site = cfg["site"].rstrip("/")
    base = ("/" + (cfg.get("base") or "").strip("/")).rstrip("/")
    host = site.split("//", 1)[1]
    dist = Path(o.dist)
    ignore = tuple(cfg.get("ignorePaths", []))

    keyfile = dist / f"{o.key}.txt"
    if not keyfile.exists() or keyfile.read_text().strip() != o.key:
        print(f"FOUT: {keyfile} ontbreekt of bevat niet precies de key. Zet public/{o.key}.txt met als inhoud de key.", file=sys.stderr)
        sys.exit(1)

    current: dict[str, str] = {}
    for f in dist.rglob("index.html"):
        rel = "/" + f.relative_to(dist).as_posix()[: -len("index.html")]
        if rel.startswith("/404") or rel.startswith(ignore):
            continue
        html = f.read_text(encoding="utf-8", errors="ignore")
        if re.search(r'<meta[^>]+name=["\']robots["\'][^>]+noindex', html, re.I):
            continue
        # zelfde percent-encoding als de sitemap (café -> caf%C3%A9)
        current[site + base + urllib.parse.quote(rel)] = page_hash(html)

    state_path = Path(o.state)
    previous = {} if (o.all or not state_path.exists()) else json.loads(state_path.read_text())
    changed = [u for u, h in current.items() if previous.get(u) != h]
    removed = [u for u in previous if u not in current]
    urls = sorted(changed + removed)
    print(f"{len(current)} pagina's, {len(changed)} nieuw/gewijzigd, {len(removed)} verwijderd.")
    if not urls:
        state_path.write_text(json.dumps(current, indent=1))
        return
    for u in urls[:20]:
        print("  ", u)

    if o.dry_run:
        return

    key_url = f"{site}{base}/{o.key}.txt"
    if o.wait_live:
        probe = changed[0] if changed else key_url
        want = current.get(probe)
        for i in range(30):
            try:
                body = urllib.request.urlopen(urllib.request.Request(probe, headers={"Cache-Control": "no-cache"}), timeout=20).read().decode("utf-8", "ignore")
                if want is None or page_hash(body) == want:
                    break
            except Exception:
                pass
            time.sleep(10)
        else:
            print("Waarschuwing: nieuwe versie nog niet zichtbaar na 5 min, toch insturen.")

    ok = True
    for i in range(0, len(urls), 10000):
        payload = {"host": host, "key": o.key, "keyLocation": key_url, "urlList": urls[i:i + 10000]}
        req = urllib.request.Request("https://api.indexnow.org/indexnow", data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
        try:
            r = urllib.request.urlopen(req, timeout=30)
            print(f"IndexNow: {r.status} (200/202 = ontvangen)")
        except urllib.error.URLError as e:
            if not isinstance(e, urllib.error.HTTPError):
                ok = False
                print(f"IndexNow niet bereikbaar: {e.reason}", file=sys.stderr)
                continue
            ok = False
            hint = {400: "ongeldig verzoek", 403: "key niet gevonden/ongeldig (staat /<key>.txt live?)",
                    422: "URL's horen niet bij host of key", 429: "te veel verzoeken"}.get(e.code, "")
            print(f"IndexNow FOUT {e.code}: {hint}", file=sys.stderr)
    if ok:
        state_path.write_text(json.dumps(current, indent=1))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
