#!/usr/bin/env python3
"""
live_check.py  -  controleert de LIVE site zoals Google hem ziet (redirects, statuscodes,
host-varianten, trailing slashes, robots/sitemap, 404). Alleen standaardbibliotheek.

Draai dit op je eigen computer of in GitHub Actions (de cloud-sandbox van Claude
kan de meeste sites niet bereiken).

    python3 .seo/live_check.py                 # leest seo.config.json
    python3 .seo/live_check.py --max-urls 300 --out LIVE-CHECK.md

Exitcode 1 bij Kritiek/Hoog.
"""
from __future__ import annotations

VERSION = "1.1"

import argparse
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse, urljoin

UA = "Mozilla/5.0 (compatible; SitefrontSEOCheck/1.0; +https://www.sitefront.nl)"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=ssl.create_default_context()))


def fetch(url: str, timeout: int = 20) -> tuple[int, dict, bytes, float]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    t0 = time.time()
    try:
        r = OPENER.open(req, timeout=timeout)
        body = r.read(400_000)
        return r.status, {k.lower(): v for k, v in r.headers.items()}, body, time.time() - t0
    except urllib.error.HTTPError as e:
        body = e.read(50_000) if hasattr(e, "read") else b""
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, body, time.time() - t0
    except Exception as e:  # DNS, TLS, timeout
        return 0, {"error": str(e)}, b"", time.time() - t0


def chain(url: str, max_hops: int = 6) -> list[tuple[int, str]]:
    hops = []
    cur = url
    for _ in range(max_hops):
        st, h, _, _ = fetch(cur)
        hops.append((st, cur))
        if st in (301, 302, 303, 307, 308) and h.get("location"):
            cur = urljoin(cur, h["location"])
            continue
        break
    return hops


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="seo.config.json")
    ap.add_argument("--max-urls", type=int, default=150)
    ap.add_argument("--out")
    o = ap.parse_args()
    cfg = json.loads(Path(o.config).read_text(encoding="utf-8-sig"))
    site = cfg["site"].rstrip("/")
    base = "/" + (cfg.get("base") or "").strip("/")
    base = "" if base == "/" else base
    root = site + base + "/"
    host = urlparse(site).netloc
    issues: list[tuple[str, str]] = []
    info: list[str] = []

    def add(sev, msg):
        issues.append((sev, msg))

    # 1. homepage
    st, h, body, dt = fetch(root)
    if st == 0:
        msg = (f"# Live-check {root}\n\n- **Kritiek**: site niet bereikbaar: {h.get('error')}\n"
               "(Lokaal of in GitHub Actions draaien; de Claude-cloudsandbox kan de meeste sites niet bereiken. "
               "Mac + python.org: draai eenmalig 'Install Certificates.command' bij CERTIFICATE_VERIFY_FAILED.)")
        if o.out:
            Path(o.out).write_text(msg + "\n", encoding="utf-8")
        print(msg)
        sys.exit(2)
    if st != 200:
        add("Kritiek", f"Homepage {root} geeft status {st} {h.get('error', '')}")
    else:
        info.append(f"Homepage 200 in {dt*1000:.0f} ms")
        m = re.search(rb'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']+)', body) or \
            re.search(rb'<link[^>]+href=["\']([^"\']+)["\'][^>]*rel=["\']canonical', body)
        if m and m.group(1).decode() != root:
            add("Hoog", f"Canonical homepage is {m.group(1).decode()}, verwacht {root}")

    # 2. http -> https
    hops = chain(root.replace("https://", "http://"))
    final = hops[-1]
    if not (final[0] == 200 and final[1].startswith("https://")):
        add("Hoog", f"http:// eindigt niet op https 200: {hops}")
    elif len(hops) > 2:
        add("Middel", f"http -> https gaat via {len(hops)-1} redirects: {[u for _, u in hops]}")

    # 3. www vs apex
    if not cfg.get("base"):
        alt = host[4:] if host.startswith("www.") else "www." + host
        hops = chain(f"https://{alt}/")
        if hops[-1][0] == 0:
            add("Middel", f"https://{alt}/ is niet bereikbaar (DNS/TLS). Zet DNS voor beide varianten zodat GitHub Pages doorstuurt.")
        elif not (hops[-1][0] == 200 and urlparse(hops[-1][1]).netloc == host):
            add("Hoog", f"https://{alt}/ stuurt niet door naar {host}: {hops}")
        elif hops[0][0] not in (301, 308):
            add("Middel", f"{alt} gebruikt redirect {hops[0][0]} in plaats van 301.")

    # 4. github.io-variant
    gh = cfg.get("githubPagesUrl")
    if gh:
        hops = chain(gh.rstrip("/") + "/")
        if not (urlparse(hops[-1][1]).netloc == host):
            add("Hoog", f"{gh} stuurt niet door naar het eigen domein (duplicaat): {hops}")

    # 5. robots.txt en sitemap
    st, h, rb, _ = fetch(root + "robots.txt")
    if st != 200:
        add("Kritiek", f"robots.txt geeft status {st}")
    elif "text/plain" not in h.get("content-type", ""):
        add("Middel", f"robots.txt content-type is {h.get('content-type')}")
    sm_urls: list[str] = []
    for name in ("sitemap-index.xml", "sitemap.xml"):
        st, h, sb, _ = fetch(root + name)
        if st == 200:
            try:
                x = ET.fromstring(sb)
                ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
                locs = [e.text.strip() for e in x.iter(ns + "loc") if e.text]
                if x.tag.endswith("sitemapindex"):
                    for child in locs:
                        st2, _, cb, _ = fetch(child)
                        if st2 == 200:
                            sm_urls += [e.text.strip() for e in ET.fromstring(cb).iter(ns + "loc") if e.text]
                        else:
                            add("Kritiek", f"Sub-sitemap {child} geeft {st2}")
                else:
                    sm_urls = locs
            except ET.ParseError as e:
                add("Kritiek", f"{name} is geen geldige XML: {e}")
            break
    else:
        add("Kritiek", "Geen sitemap-index.xml of sitemap.xml bereikbaar")
    info.append(f"Sitemap: {len(sm_urls)} URL's")

    # 6. 404 en trailing slash
    st, _, _, _ = fetch(root + "deze-pagina-bestaat-echt-niet-123/")
    if st != 404:
        add("Hoog", f"Onbekende URL geeft {st} in plaats van 404 (soft 404).")
    dir_urls = [u for u in sm_urls if u.endswith("/") and u.rstrip("/") + "/" != root]
    if dir_urls:
        test = dir_urls[0].rstrip("/")
        hops = chain(test)
        if hops[0][0] == 404:
            add("Hoog", f"{test} (zonder slash) geeft 404. Interne/externe links zonder slash lopen dood.")
        elif hops[0][0] in (301, 308):
            info.append("Zonder-slash-URL's krijgen een 301 naar de slash-versie (verwacht gedrag GitHub Pages).")

    # 7. alle sitemap-URL's
    bad = []
    slow = []
    for u in sm_urls[: o.max_urls]:
        st, h, b, dt = fetch(u)
        if st != 200:
            bad.append(f"{u} -> {st} {h.get('location', '')}")
        elif dt > 1.5:
            slow.append(f"{u} ({dt:.1f}s)")
        elif re.search(rb'<meta[^>]+name=["\']robots["\'][^>]+noindex', b):
            bad.append(f"{u} -> staat in sitemap maar heeft noindex")
    for b_ in bad:
        add("Hoog", f"Sitemap-URL niet in orde: {b_}")
    if slow:
        add("Laag", f"Trage responses (>1,5 s): {', '.join(slow[:5])}")

    # rapport
    order = {"Kritiek": 0, "Hoog": 1, "Middel": 2, "Laag": 3}
    lines = [f"# Live-check {root}", ""] + [f"- {i}" for i in info] + [""]
    if issues:
        for sev, msg in sorted(issues, key=lambda x: order[x[0]]):
            lines.append(f"- **{sev}**: {msg}")
    else:
        lines.append("Geen problemen gevonden.")
    report = "\n".join(lines)
    if o.out:
        Path(o.out).write_text(report + "\n", encoding="utf-8")
    print(report)
    sys.exit(1 if any(s in ("Kritiek", "Hoog") for s, _ in issues) else 0)


if __name__ == "__main__":
    main()
