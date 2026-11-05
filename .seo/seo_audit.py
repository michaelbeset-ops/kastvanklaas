#!/usr/bin/env python3
"""
seo_audit.py  -  statische SEO-audit van een gebouwde Astro-site (de dist/-map).

Controleert techniek, on-page, links, structured data, lokale signalen (NAP)
en AI-gereedheid, en geeft een score per categorie. Alleen standaardbibliotheek.

Gebruik (vanuit de root van het Astro-project, na `npm run build`):
    python3 .seo/seo_audit.py
    python3 .seo/seo_audit.py --dist dist --config seo.config.json --out .seo/out/audit.md --json .seo/out/audit.json
    python3 .seo/seo_audit.py --fail-on kritiek      # CI-gate: faal alleen op Kritiek

Exitcode: 1 als er bevindingen zijn op of boven --fail-on (standaard: hoog), anders 0.
"""
from __future__ import annotations

VERSION = "1.1"

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote

SEV_ORDER = {"Kritiek": 0, "Hoog": 1, "Middel": 2, "Laag": 3, "Info": 4}
SEV_WEIGHT = {"Kritiek": 25, "Hoog": 10, "Middel": 4, "Laag": 1, "Info": 0}
CATEGORIES = ["Techniek", "On-page", "Links", "Structured data", "Lokaal", "AI-gereedheid", "Content"]

LOCAL_TYPES = {
    "LocalBusiness", "HomeAndConstructionBusiness", "Restaurant", "FoodEstablishment", "CafeOrCoffeeShop",
    "Bakery", "BarOrPub", "Store", "ClothingStore", "FurnitureStore", "HomeGoodsStore", "GardenStore",
    "ProfessionalService", "HairSalon", "BeautySalon", "HealthAndBeautyBusiness", "AutoRepair",
    "AutomotiveBusiness", "Plumber", "Electrician", "HousePainter", "RoofingContractor",
    "GeneralContractor", "Locksmith", "MovingCompany", "LegalService", "AccountingService",
    "FinancialService", "RealEstateAgent", "SportsActivityLocation", "ExerciseGym", "LodgingBusiness",
    "Hotel", "EntertainmentBusiness", "ChildCare", "Dentist", "MedicalBusiness", "Florist",
    "ShoeStore", "JewelryStore", "SportingGoodsStore", "BikeStore", "PetStore", "EducationalOrganization",
}
ORG_TYPES = LOCAL_TYPES | {"Organization", "Corporation", "OnlineBusiness", "OnlineStore", "NGO"}

AI_SEARCH_BOTS = ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "Applebot"]
AI_TRAINING_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot", "Meta-ExternalAgent"]

THIN_EXEMPT = re.compile(r"(contact|privacy|cookie|voorwaarden|disclaimer|bedankt|algemene|sitemap|404|zoeken|login)", re.I)
VERIFY_FILE = re.compile(r"(^|/)(google[0-9a-f]{16}\.html|yandex_[0-9a-f]+\.html|BingSiteAuth\.xml)$", re.I)
FILE_EXT = re.compile(r"\.[a-z0-9]{2,5}$", re.I)


# --------------------------------------------------------------------------- parsing
class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lang = None
        self.titles: list[str] = []
        self._in_title = False
        self.meta: dict[str, str] = {}
        self.meta_prop: dict[str, str] = {}
        self.canonicals: list[str] = []
        self.hreflang: list[tuple[str, str]] = []
        self.icons: list[str] = []
        self.headings: list[tuple[int, str]] = []
        self._heading_level = 0
        self._heading_buf = ""
        self.images: list[dict] = []
        self.srcset: list[str] = []
        self.links: list[dict] = []
        self._link_stack: list[dict] = []
        self.jsonld_raw: list[str] = []
        self._in_ld = False
        self._ld_buf = ""
        self._skip_depth = 0  # script/style/template
        self.text_parts: list[str] = []
        self.iframes: list[str] = []
        self.http_resources: list[str] = []
        self.has_main = False
        self.islands_load = 0
        self._svg_depth = 0
        self.refresh = None

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v if v is not None else "") for k, v in attrs}
        a_raw = dict(attrs)
        if tag == "html":
            self.lang = a.get("lang")
        elif tag == "svg":
            self._svg_depth += 1
        elif tag == "title" and not self._svg_depth:
            self._in_title = True
            self.titles.append("")
        elif tag == "meta":
            if a.get("http-equiv", "").lower() == "refresh":
                self.refresh = a.get("content", "")
            if a.get("name"):
                k = a["name"].lower()
                # meerdere robots-metas: Google combineert ze (meest restrictief), dus niet overschrijven
                self.meta[k] = (self.meta[k] + ", " if k in ("robots", "googlebot") and k in self.meta else "") + a.get("content", "")
            if a.get("property"):
                self.meta_prop[a["property"].lower()] = a.get("content", "")
        elif tag == "link":
            rel = a.get("rel", "").lower().split()
            if "canonical" in rel:
                self.canonicals.append(a.get("href", ""))
            if "alternate" in rel and a.get("hreflang"):
                self.hreflang.append((a["hreflang"], a.get("href", "")))
            if "icon" in rel or "apple-touch-icon" in rel:
                self.icons.append(a.get("href", ""))
            if a.get("href", "").startswith("http://") and "stylesheet" in rel:
                self.http_resources.append(a["href"])
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._heading_level = int(tag[1])
            self._heading_buf = ""
        elif tag in ("img", "source") and a.get("srcset"):
            self.srcset.extend(c.strip().split()[0] for c in a["srcset"].split(",") if c.strip())
        if tag == "img":
            self.images.append({
                "src": a.get("src", ""),
                "alt": a_raw.get("alt"),  # None = ontbreekt, "" = decoratief
                "width": a.get("width"),
                "height": a.get("height"),
                "loading": a.get("loading", "").lower(),
                "fetchpriority": a.get("fetchpriority", "").lower(),
                "in_link": bool(self._link_stack),
            })
            if self._link_stack and a_raw.get("alt"):
                self._link_stack[-1]["text"] += " " + a_raw.get("alt", "")
            if a.get("src", "").startswith("http://"):
                self.http_resources.append(a["src"])
        elif tag == "a":
            link = {"href": a.get("href"), "rel": a.get("rel", "").lower(), "text": "",
                    "aria": a.get("aria-label", "") or a.get("title", "")}
            self.links.append(link)
            self._link_stack.append(link)
        elif tag == "script":
            if a.get("type", "").lower() == "application/ld+json":
                self._in_ld = True
                self._ld_buf = ""
            else:
                self._skip_depth += 1
                if a.get("src", "").startswith("http://"):
                    self.http_resources.append(a["src"])
        elif tag in ("style", "template", "noscript"):
            self._skip_depth += 1
        elif tag == "iframe":
            self.iframes.append(a.get("src", ""))
        elif tag == "astro-island" and a.get("client", "") == "load":
            self.islands_load += 1
        elif tag == "main":
            self.has_main = True

    def handle_endtag(self, tag):
        if tag == "svg" and self._svg_depth:
            self._svg_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6") and self._heading_level:
            self.headings.append((self._heading_level, " ".join(self._heading_buf.split())))
            self._heading_level = 0
        elif tag == "a" and self._link_stack:
            self._link_stack.pop()
        elif tag == "script":
            if self._in_ld:
                self._in_ld = False
                self.jsonld_raw.append(self._ld_buf)
            elif self._skip_depth:
                self._skip_depth -= 1
        elif tag in ("style", "template", "noscript") and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data):
        if self._in_ld:
            self._ld_buf += data
            return
        if self._in_title and self.titles:
            self.titles[-1] += data
            return
        if self._skip_depth:
            return
        if self._heading_level:
            self._heading_buf += data
        for link in self._link_stack:
            link["text"] += data
        self.text_parts.append(data)

    @property
    def text(self) -> str:
        return " ".join(" ".join(self.text_parts).split())


# --------------------------------------------------------------------------- helpers
class Audit:
    def __init__(self) -> None:
        self.issues: list[dict] = []

    def add(self, sev: str, cat: str, code: str, msg: str, page: str = "/", fix: str = "") -> None:
        self.issues.append({"sev": sev, "cat": cat, "code": code, "msg": msg, "page": page, "fix": fix})


def digits(s) -> str:
    return re.sub(r"\D", "", s if isinstance(s, str) else str(s or ""))


def nl_phone_variants(phone: str) -> set[str]:
    """+31 78 123 4567 -> {'31781234567', '0781234567', '781234567'}"""
    d = digits(phone)
    out = {d}
    if d.startswith("0031"):
        d = d[2:]
    if d.startswith("31"):
        out |= {d, "0" + d[2:], d[2:]}
    elif d.startswith("0"):
        out |= {"31" + d[1:], d[1:]}
    return {x for x in out if len(x) >= 9}


def phone_pattern(phone: str):
    """Regex die het nummer vindt in elke NL-schrijfwijze: 078-1234567, +31 (0)78 123 45 67, 0031781234567."""
    d = digits(phone)
    d = d[2:] if d.startswith("00") else d
    nat = d[2:] if d.startswith("31") else d.lstrip("0")
    if len(nat) < 8:
        return None
    sep = r"[\s\-.()/]*"
    return re.compile(r"(?<!\d)(?:(?:\+|00)31" + sep + r"(?:\(?0\)?)?|0)" + sep + sep.join(nat) + r"(?!\d)")


def norm_path(p: str) -> str:
    p = unquote(p.split("#")[0].split("?")[0]) or "/"
    if not p.startswith("/"):
        p = "/" + p
    return p


def iter_jsonld_nodes(obj):
    """Lever alle dict-nodes (inclusief @graph en geneste objecten)."""
    if isinstance(obj, list):
        for x in obj:
            yield from iter_jsonld_nodes(x)
    elif isinstance(obj, dict):
        yield obj
        for k, v in obj.items():
            if isinstance(v, (dict, list)):
                yield from iter_jsonld_nodes(v)


def node_types(node: dict) -> set[str]:
    t = node.get("@type", [])
    return set(t if isinstance(t, list) else [t])


def robots_groups(text: str) -> dict[str, list[tuple[str, str]]]:
    """Parse robots.txt naar {useragent_lower: [(directive, value)]}."""
    groups: dict[str, list[tuple[str, str]]] = defaultdict(list)
    agents: list[str] = []
    last_was_agent = False
    for raw in text.lstrip("\ufeff").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, val = [x.strip() for x in line.split(":", 1)]
        key = key.lower()
        if key == "sitemap":
            continue  # geen groepslid (RFC 9309 par. 2.3.5), breekt de groep niet
        if key == "user-agent":
            if not last_was_agent:
                agents = []
            agents.append(val.lower())
            last_was_agent = True
        else:
            last_was_agent = False
            for ag in agents:
                groups[ag].append((key, val))
    return groups


def bot_blocked_root(groups, bot: str) -> bool:
    """True als de bot (via eigen groep, of anders via *) Disallow: / heeft zonder Allow: /."""
    rules = groups.get(bot.lower())
    if rules is None:
        rules = groups.get("*", [])
    disallow_root = any(k == "disallow" and v.strip() in ("/", "/*") for k, v in rules)
    allow_root = any(k == "allow" and v.strip() == "/" for k, v in rules)
    return disallow_root and not allow_root


# --------------------------------------------------------------------------- main audit
def run(dist: Path, cfg: dict) -> tuple[Audit, dict]:
    au = Audit()
    site = (cfg.get("site") or "").rstrip("/")
    if not site:
        print("FOUT: 'site' ontbreekt in seo.config.json", file=sys.stderr)
        sys.exit(2)
    site_host = urlparse(site).netloc.lower()
    base = "/" + (cfg.get("base") or "").strip("/")
    base = "" if base == "/" else base
    demo = cfg.get("mode") == "demo"
    strategy = set(cfg.get("strategy") or ["lokaal"])
    biz = cfg.get("business") or {}
    ignore = [norm_path(p) for p in cfg.get("ignorePaths", [])]
    lang_expected = (cfg.get("language") or "nl-NL").split("-")[0].lower()

    # ---- pagina's verzamelen
    pages: dict[str, dict] = {}
    for f in sorted(dist.rglob("*.html")):
        rel = f.relative_to(dist).as_posix()
        if rel.endswith("index.html"):
            path = "/" + rel[: -len("index.html")]
        elif rel.startswith("404"):
            path = "/" + rel
        else:
            path = "/" + rel[:-5]  # build.format 'file': pagina.html wordt geserveerd op /pagina
        url_path = (base + path) if base else path
        p = PageParser()
        try:
            p.feed(f.read_text(encoding="utf-8", errors="ignore"))
        except Exception as e:  # pragma: no cover
            au.add("Hoog", "Techniek", "parse", f"HTML kon niet worden gelezen: {e}", url_path)
            continue
        robots = (p.meta.get("robots", "") + " " + p.meta.get("googlebot", "")).lower()
        pages[url_path] = {
            "file": f, "p": p, "noindex": bool(re.search(r"\b(noindex|none)\b", robots)), "robots": robots,
            "is404": rel.startswith("404"), "size": f.stat().st_size,
            # Astro-redirectpagina's (meta refresh) en verificatiebestanden zijn geen echte pagina's
            "skip": p.refresh is not None or bool(VERIFY_FILE.search(rel)),
        }

    if not pages:
        print(f"FOUT: geen HTML gevonden in {dist}. Draai eerst `npm run build`.", file=sys.stderr)
        sys.exit(2)

    existing_paths = set(pages)
    home = base + "/" if base else "/"

    def resolves(path: str) -> bool:
        if path in existing_paths:
            return True
        if not path.endswith("/") and ((path + "/") in existing_paths or (path + ".html") in existing_paths):
            return True
        if FILE_EXT.search(path):
            return (dist / path[len(base):].lstrip("/")).exists() if path.startswith(base or "/") else False
        return False

    def is_ignored(path: str) -> bool:
        return any(path.startswith(i if not base else base + i) for i in ignore)

    indexable = [u for u, d in pages.items() if not d["noindex"] and not d["is404"] and not d["skip"] and not is_ignored(u)]
    inbound: dict[str, int] = defaultdict(int)
    titles: dict[str, list[str]] = defaultdict(list)
    descs: dict[str, list[str]] = defaultdict(list)
    all_types: set[str] = set()
    phone_variants = nl_phone_variants(biz.get("phone", "")) if biz.get("phone") else set()
    phone_re = phone_pattern(biz.get("phone", "")) if biz.get("phone") else None
    phone_seen_text = False
    street_seen_text = False
    has_tel_link = False
    org_nodes: list[tuple[str, dict]] = []

    for url, d in pages.items():
        p: PageParser = d["p"]
        if d["is404"] or d["skip"]:
            continue
        txt = p.text

        # ---------------- demomodus: andere regels
        if demo:
            if not d["noindex"]:
                au.add("Kritiek", "Techniek", "demo-index", "Demosite zonder noindex: kan in Google komen naast de echte site van het bedrijf.", url,
                       "Zet <meta name=\"robots\" content=\"noindex, nofollow\"> (PUBLIC_VOORSTEL=1).")
            if p.canonicals:
                au.add("Kritiek", "Techniek", "demo-canonical", "Demosite heeft een canonical.", url, "Verwijder canonical in demomodus.")
            if p.jsonld_raw:
                au.add("Kritiek", "Structured data", "demo-jsonld", "Demosite bevat JSON-LD.", url, "Geen JSON-LD in demomodus.")
            # kapotte links in een demo kosten de verkoop: die blijven we wel controleren
            for ln in p.links:
                href = (ln["href"] or "").strip()
                if not href or href.startswith("#"):
                    continue
                absu = urlparse(urljoin(site + url, href))
                if absu.scheme not in ("http", "https") or (absu.netloc and absu.netloc.lower() != site_host):
                    continue
                if not resolves(norm_path(absu.path)):
                    au.add("Kritiek", "Links", "broken", f"Kapotte interne link: {href} (in demo's via BASE_URL linken)", url)
            continue

        # ---------------- techniek
        if not p.lang:
            au.add("Middel", "Techniek", "lang", "<html> mist een lang-attribuut.", url, "Zet <html lang=\"nl\">.")
        elif not p.lang.lower().startswith(lang_expected):
            au.add("Middel", "Techniek", "lang", f"lang=\"{p.lang}\" past niet bij taal {lang_expected}.", url)
        if "viewport" not in p.meta:
            au.add("Hoog", "Techniek", "viewport", "Geen viewport-meta (mobile-first indexering).", url)
        if "nosnippet" in d["robots"] or re.search(r"max-snippet\s*:\s*0", d["robots"]):
            au.add("Hoog", "AI-gereedheid", "nosnippet", "nosnippet/max-snippet:0: pagina kan niet als bron in AI Overviews of snippets verschijnen.", url)
        if d["noindex"] and not is_ignored(url):
            au.add("Hoog", "Techniek", "noindex", "Pagina staat op noindex maar niet in ignorePaths. Bewust?", url,
                   "Haal noindex weg, of zet het pad in ignorePaths in seo.config.json.")
        if not d["noindex"]:
            if len(p.canonicals) == 0:
                au.add("Kritiek", "Techniek", "canonical-missing", "Geen canonical.", url, "Gebruik het SEO-component (zet canonical automatisch).")
            elif len(p.canonicals) > 1:
                au.add("Kritiek", "Techniek", "canonical-multi", f"{len(p.canonicals)} canonicals.", url)
            else:
                c = p.canonicals[0]
                cu = urlparse(c)
                if not cu.scheme:
                    au.add("Hoog", "Techniek", "canonical-relative", f"Canonical is niet absoluut: {c}", url)
                else:
                    if cu.netloc.lower() != site_host:
                        au.add("Kritiek", "Techniek", "canonical-host", f"Canonical wijst naar ander domein: {c}", url,
                               "Controleer `site` in astro.config.mjs en seo.config.json.")
                    if cu.scheme != "https":
                        au.add("Hoog", "Techniek", "canonical-http", f"Canonical zonder https: {c}", url)
                    cpath = norm_path(cu.path)
                    if cpath != url and not (url.endswith(".html") and cpath == url[:-5]):
                        if cpath.rstrip("/") == url.rstrip("/"):
                            au.add("Hoog", "Techniek", "canonical-slash", f"Canonical verschilt alleen in trailing slash ({cpath}).", url,
                                   "GitHub Pages serveert mappen met slash; canonical moet eindigen op /.")
                        else:
                            au.add("Hoog", "Techniek", "canonical-other", f"Canonical wijst naar andere pagina: {cpath}", url)
        if not d["file"].name == "index.html" and not d["is404"]:
            au.add("Middel", "Techniek", "file-format", "Pagina gebouwd als .html-bestand (build.format 'file').", url,
                   "Gebruik build.format 'directory' voor schone URL's met slash.")
        for r in sorted(set(p.http_resources))[:3]:
            au.add("Middel", "Techniek", "mixed", f"Bron via http:// (mixed content): {r}", url)
        if d["size"] > 250_000:
            au.add("Laag", "Techniek", "html-size", f"HTML is {d['size']//1024} KB (inline CSS/JS of SVG?).", url)

        # ---------------- on-page
        if not p.titles or not p.titles[0].strip():
            au.add("Kritiek", "On-page", "title-missing", "Geen <title>.", url)
        else:
            if len(p.titles) > 1:
                au.add("Hoog", "On-page", "title-multi", f"{len(p.titles)} <title>-tags.", url)
            t = " ".join(p.titles[0].split())
            if not d["noindex"]:
                titles[t].append(url)
            if len(t) > 62:
                au.add("Middel", "On-page", "title-long", f"Title is {len(t)} tekens (wordt afgekapt na ~60): \"{t}\"", url)
            elif len(t) < 25:
                au.add("Laag", "On-page", "title-short", f"Title is kort ({len(t)} tekens): \"{t}\"", url,
                       "Dienst + plaats + merk, bijv. 'Tuinaanleg in Dordrecht | Bedrijfsnaam'.")
        desc = " ".join(p.meta.get("description", "").split())
        if not desc:
            au.add("Hoog", "On-page", "desc-missing", "Geen meta description.", url)
        else:
            if not d["noindex"]:
                descs[desc].append(url)
            if len(desc) > 160:
                au.add("Laag", "On-page", "desc-long", f"Meta description {len(desc)} tekens (afgekapt na ~155).", url)
            elif len(desc) < 70:
                au.add("Laag", "On-page", "desc-short", f"Meta description kort ({len(desc)} tekens).", url)
        h1s = [h for lvl, h in p.headings if lvl == 1]
        if not h1s:
            au.add("Hoog", "On-page", "h1-missing", "Geen H1.", url)
        elif len(h1s) > 1:
            au.add("Middel", "On-page", "h1-multi", f"{len(h1s)} H1's.", url)
        prev = 0
        for lvl, _ in p.headings:
            if prev and lvl > prev + 1:
                au.add("Laag", "On-page", "heading-skip", f"Kopniveau springt van h{prev} naar h{lvl}.", url)
                break
            prev = lvl
        no_alt = [i for i in p.images if i["alt"] is None]
        if no_alt:
            au.add("Middel", "On-page", "img-alt", f"{len(no_alt)} afbeelding(en) zonder alt-attribuut.", url,
                   "Beschrijvende alt, of alt=\"\" voor decoratie.")
        no_dim = [i for i in p.images if not (i["width"] and i["height"]) and not i["src"].endswith(".svg")]
        if no_dim:
            au.add("Laag", "Techniek", "img-dim", f"{len(no_dim)} afbeelding(en) zonder width/height (CLS-risico).", url,
                   "Gebruik <Image> uit astro:assets.")
        for img in p.images:
            src = img["src"].strip()
            if not src or src.startswith("data:"):
                continue
            su = urlparse(urljoin(site + url, src))
            if su.netloc.lower() == site_host:
                rel_src = su.path[len(base):] if base and su.path.startswith(base) else su.path
                if not (dist / unquote(rel_src).lstrip("/")).exists():
                    au.add("Hoog", "Links", "img-404", f"Afbeelding bestaat niet: {src}", url)
        for src in p.srcset:
            su = urlparse(urljoin(site + url, src))
            if su.netloc.lower() == site_host:
                rel_src = su.path[len(base):] if base and su.path.startswith(base) else su.path
                if not (dist / unquote(rel_src).lstrip("/")).exists():
                    au.add("Hoog", "Links", "img-404", f"srcset-bron bestaat niet: {src}", url)
        if p.images and p.images[0]["loading"] != "lazy" and p.images[0]["fetchpriority"] != "high" and not p.images[0]["src"].endswith(".svg"):
            au.add("Laag", "Techniek", "lcp-priority", "Eerste afbeelding zonder fetchpriority=\"high\" (als dit de hero is: <Image priority />).", url)
        if p.islands_load:
            au.add("Laag", "Techniek", "client-load", f"{p.islands_load} island(s) met client:load: laadt JavaScript direct (INP/snelheid).", url,
                   "Gebruik client:visible of client:idle tenzij het element meteen interactief moet zijn.")
        dash_where = [w for w, s in (("title", " ".join(p.titles)), ("meta description", p.meta.get("description", "")), ("tekst", p.text)) if "\u2014" in s]
        if dash_where:
            au.add("Middel", "Content", "emdash", f"Em-dash (\u2014) in {', '.join(dash_where)}: Sitefront-regel, leest als AI-tekst.", url,
                   "Vervang door komma, punt of dubbele punt.")
        if p.images and p.images[0]["loading"] == "lazy" and not p.images[0]["in_link"]:
            au.add("Middel", "Techniek", "lcp-lazy", "Eerste afbeelding is lazy-loaded (vaak het LCP-element).", url,
                   "loading=\"eager\" fetchpriority=\"high\" op de hero-afbeelding.")
        og_missing = [k for k in ("og:title", "og:description", "og:image") if not p.meta_prop.get(k)]
        if og_missing:
            au.add("Middel", "On-page", "og", f"Open Graph mist: {', '.join(og_missing)}.", url)
        elif not p.meta_prop["og:image"].startswith("http"):
            au.add("Middel", "On-page", "og-rel", "og:image is geen absolute URL.", url)
        else:
            ogu = urlparse(p.meta_prop["og:image"])
            if ogu.netloc.lower() == site_host:
                rel_img = ogu.path[len(base):] if base and ogu.path.startswith(base) else ogu.path
                if not (dist / unquote(rel_img).lstrip("/")).exists():
                    au.add("Middel", "On-page", "og-404", f"og:image bestaat niet in dist: {ogu.path}", url)
        if "twitter:card" not in p.meta:
            au.add("Laag", "On-page", "twitter", "Geen twitter:card.", url)

        # ---------------- content
        words = len(re.findall(r"\w{2,}", txt))
        if "[[AANLEVEREN" in txt or "[[AANLEVEREN" in " ".join(p.titles) or "[[AANLEVEREN" in desc:
            au.add("Hoog", "Content", "aanleveren", "Bevat nog [[AANLEVEREN]]-markeringen.", url)
        if re.search(r"lorem ipsum", txt, re.I):
            au.add("Kritiek", "Content", "lorem", "Lorem ipsum op de pagina.", url)
        if not d["noindex"] and words < 250 and url != home and not THIN_EXEMPT.search(url):
            au.add("Middel", "Content", "thin", f"Weinig tekst ({words} woorden): risico op dunne content.", url,
                   "Voeg echte, specifieke inhoud toe (werkwijze, prijsindicatie, werkgebied, vragen, projecten).")
        if phone_re and phone_re.search(txt):
            phone_seen_text = True
        if biz.get("street") and biz["street"].lower() in txt.lower():
            street_seen_text = True

        # ---------------- links
        for ln in p.links:
            href = (ln["href"] or "").strip()
            label = " ".join((ln["text"] + " " + ln["aria"]).split())
            if href.startswith("tel:"):
                has_tel_link = True
                if phone_re and not phone_re.search(unquote(href[4:])):
                    au.add("Hoog", "Lokaal", "tel-mismatch", f"tel:-link {href} wijkt af van het telefoonnummer in seo.config.json.", url)
                continue
            if not href or href.startswith("#"):
                continue
            absu = urlparse(urljoin(site + url, href))
            if absu.scheme not in ("http", "https") or (absu.netloc and absu.netloc.lower() != site_host):
                continue  # mailto:, sms:, whatsapp:, geo:, externe links
            path = norm_path(absu.path)
            if not label:
                au.add("Laag", "Links", "anchor-empty", f"Link zonder tekst of aria-label: {href}", url)
            if "nofollow" in ln["rel"]:
                au.add("Laag", "Links", "internal-nofollow", f"Interne link met nofollow: {href}", url)
            if FILE_EXT.search(path) and not path.endswith(".html"):
                if not resolves(path):
                    au.add("Kritiek", "Links", "broken-asset", f"Link naar ontbrekend bestand: {href}", url)
                continue
            if path.endswith(".html") and not path.endswith("index.html"):
                au.add("Middel", "Links", "link-html", f"Interne link met .html: {href}", url, "Link naar /pad/ in plaats van /pad.html.")
            if not resolves(path):
                au.add("Kritiek", "Links", "broken", f"Kapotte interne link: {href}", url)
                continue
            if not path.endswith("/") and not path.endswith(".html") and (path + "/") in existing_paths:
                au.add("Middel", "Links", "no-slash", f"Interne link zonder trailing slash: {href} (extra 301 op GitHub Pages).", url,
                       f"Gebruik {path}/")
            target = path if path in existing_paths else path + "/"
            if target != url:
                inbound[target] += 1

        # ---------------- structured data
        page_types: set[str] = set()
        for raw in p.jsonld_raw:
            try:
                data = json.loads(raw)
            except Exception as e:
                au.add("Kritiek", "Structured data", "jsonld-parse", f"JSON-LD kan niet worden gelezen: {e}", url)
                continue
            top = data if isinstance(data, list) else [data]
            top = [n for t in top if isinstance(t, dict) for n in (t.get("@graph") or [t]) if isinstance(n, dict)]
            for node in iter_jsonld_nodes(data):
                tys = node_types(node)
                page_types |= tys
                if any(node is t for t in top) and tys & ORG_TYPES and ("name" in node) and ("address" in node or "areaServed" in node or "url" in node):
                    org_nodes.append((url, node))
                    geo = node.get("geo") if isinstance(node.get("geo"), dict) else None
                    if geo:
                        for k in ("latitude", "longitude"):
                            v = str(geo.get(k, ""))
                            if v and len(v.split(".")[-1]) < 5:
                                au.add("Laag", "Structured data", "geo-precision", f"geo.{k} heeft minder dan 5 decimalen ({v}); Google vraagt er minstens 5.", url)
                                break
                if "FAQPage" in tys:
                    au.add("Info", "Structured data", "faq", "FAQPage-markup: geen rich result meer sinds mei 2026. Mag blijven als de vragen zichtbaar op de pagina staan.", url)
                if "HowTo" in tys:
                    au.add("Info", "Structured data", "howto", "HowTo-markup levert al sinds 2023 geen rich result meer.", url)
                if tys & ORG_TYPES and ("aggregateRating" in node or "review" in node):
                    au.add("Middel", "Structured data", "self-review", "aggregateRating/review op het eigen bedrijf: Google toont geen sterren voor 'self-serving' reviews en het kan als misleidend gezien worden.", url,
                           "Verwijder rating uit LocalBusiness/Organization; toon echte reviews als tekst met bron.")
                if "BreadcrumbList" in tys:
                    for it in node.get("itemListElement", []) or []:
                        item = it.get("item") if isinstance(it, dict) else None
                        iid = item.get("@id") if isinstance(item, dict) else item
                        if iid and not str(iid).startswith("http"):
                            au.add("Middel", "Structured data", "crumb-rel", f"Breadcrumb-item niet absoluut: {iid}", url)
                if tys & {"Article", "BlogPosting", "NewsArticle"}:
                    for req in ("headline", "datePublished", "image", "author"):
                        if req not in node:
                            au.add("Middel", "Structured data", "article-prop", f"{'/'.join(sorted(tys))} mist '{req}'.", url)
                if "Product" in tys and "offers" not in node and "review" not in node and "aggregateRating" not in node:
                    au.add("Middel", "Structured data", "product-offer", "Product zonder offers/review/aggregateRating: geen productresultaat mogelijk.", url)
        all_types |= page_types
        if url == home and not (page_types & ORG_TYPES):
            au.add("Hoog", "Structured data", "home-org", "Homepage mist Organization/LocalBusiness-JSON-LD (de entiteit).", url)
        if url == home and "WebSite" not in page_types:
            au.add("Laag", "Structured data", "home-website", "Homepage mist WebSite-JSON-LD (sitenaam in Google).", url)
        depth = len([s for s in url[len(base):].split("/") if s])
        if depth >= 2 and "BreadcrumbList" not in page_types:
            au.add("Laag", "Structured data", "crumbs", "Diepere pagina zonder BreadcrumbList.", url)

    # ---------------- sitebrede checks
    if not demo:
        for t, urls in titles.items():
            if len(urls) > 1:
                au.add("Hoog", "On-page", "title-dup", f"Dubbele title \"{t}\" op {len(urls)} pagina's.", ", ".join(urls[:5]))
        for dsc, urls in descs.items():
            if len(urls) > 1:
                au.add("Middel", "On-page", "desc-dup", f"Dubbele meta description op {len(urls)} pagina's.", ", ".join(urls[:5]))
        for u in indexable:
            if u != home and inbound.get(u, 0) == 0:
                au.add("Middel", "Links", "orphan", "Weespagina: geen enkele interne link wijst hierheen.", u, "Link vanuit menu, footer of een verwante pagina.")

        # NAP-consistentie in JSON-LD
        if biz:
            for url, node in org_nodes:
                if biz.get("name") and isinstance(node.get("name"), str) and node["name"].strip() != biz["name"].strip():
                    au.add("Hoog", "Lokaal", "nap-name", f"Naam in JSON-LD \"{node['name']}\" wijkt af van \"{biz['name']}\".", url)
                tels = node.get("telephone")
                tels = tels if isinstance(tels, list) else [tels] if tels else []
                tel = ", ".join(map(str, tels))
                if tels and phone_re and not any(phone_re.search(str(t)) for t in tels):
                    au.add("Hoog", "Lokaal", "nap-phone", f"Telefoon in JSON-LD ({tel}) wijkt af van seo.config.json.", url)
                addr = node.get("address")
                if isinstance(addr, dict) and biz.get("postalCode"):
                    pc = str(addr.get("postalCode") or "").replace(" ", "").upper()
                    if pc and pc != biz["postalCode"].replace(" ", "").upper():
                        au.add("Hoog", "Lokaal", "nap-pc", f"Postcode in JSON-LD ({addr.get('postalCode')}) wijkt af.", url)
                tys = node_types(node)
                if tys & LOCAL_TYPES:
                    if "address" not in node and biz.get("showAddress", True):
                        au.add("Hoog", "Structured data", "lb-address", "LocalBusiness zonder address.", url)
                    for rec in ("telephone", "url", "openingHoursSpecification", "image"):
                        if rec not in node:
                            au.add("Laag", "Structured data", "lb-rec", f"LocalBusiness mist aanbevolen '{rec}'.", url)
                    if "geo" not in node and biz.get("showAddress", True):
                        au.add("Laag", "Structured data", "lb-geo", "LocalBusiness zonder geo-coördinaten.", url)
                if not node.get("sameAs"):
                    au.add("Laag", "AI-gereedheid", "sameas", "Entiteit zonder sameAs (GBP, socials, KvK-pagina): minder herkenbaar voor Google en AI.", url)
                if not node.get("description"):
                    au.add("Laag", "AI-gereedheid", "entity-desc", "Entiteit zonder description: geef in één zin wie, wat, waar.", url)

        if "lokaal" in strategy and biz:
            if not any(t in LOCAL_TYPES for t in all_types):
                au.add("Hoog", "Lokaal", "no-localbusiness", "Strategie 'lokaal' maar nergens LocalBusiness(-subtype) JSON-LD.", home)
            if phone_variants and not phone_seen_text:
                au.add("Hoog", "Lokaal", "nap-visible", "Telefoonnummer uit seo.config.json staat op geen enkele pagina als zichtbare tekst.", home,
                       "Zet NAP zichtbaar in footer en op de contactpagina, uit dezelfde databron.")
            if biz.get("street") and biz.get("showAddress", True) and not street_seen_text:
                au.add("Middel", "Lokaal", "addr-visible", "Straatnaam staat nergens zichtbaar op de site.", home)
            if biz.get("phone") and not has_tel_link:
                au.add("Middel", "Lokaal", "tel-link", "Geen klikbare tel:-link (belangrijk op mobiel).", home)
            if not any(re.search(r"contact", u) for u in pages):
                au.add("Middel", "Lokaal", "contact-page", "Geen contactpagina gevonden.", home)

        for svc in cfg.get("services", []) or []:
            sp = norm_path(svc.get("path", ""))
            sp = (base + sp) if base else sp
            if svc.get("path") and sp not in pages:
                au.add("Hoog", "Content", "service-missing", f"Dienstpagina uit seo.config.json bestaat niet: {sp} ({svc.get('name')})", home,
                       "Eén sterke pagina per dienst is de basis van lokale zichtbaarheid.")

        if "ai" in strategy:
            if not (dist / "llms.txt").exists():
                au.add("Laag", "AI-gereedheid", "llms", "Geen /llms.txt (optioneel, geen rankingfactor, wel handig voor AI-agents).", home)
            if not any(re.search(r"over-|over/|about", u) for u in pages):
                au.add("Middel", "AI-gereedheid", "about", "Geen 'over ons'-pagina: belangrijk voor E-E-A-T en entiteitsherkenning.", home)

    # ---------------- robots.txt
    robots_file = dist / "robots.txt"
    if not robots_file.exists():
        if not demo:
            au.add("Kritiek", "Techniek", "robots-missing", "Geen robots.txt in dist.", "/robots.txt", "Gebruik assets/astro/robots.txt.ts.")
    else:
        rt = robots_file.read_text(encoding="utf-8", errors="ignore")
        groups = robots_groups(rt)
        if not demo and bot_blocked_root(groups, "*") and not groups.get("googlebot"):
            au.add("Kritiek", "Techniek", "robots-block-all", "robots.txt blokkeert alle crawlers (Disallow: /).", "/robots.txt")
        sm_lines = re.findall(r"(?im)^\s*sitemap\s*:\s*(\S+)", rt)
        if not sm_lines and not demo:
            au.add("Middel", "Techniek", "robots-sitemap", "robots.txt verwijst niet naar de sitemap.", "/robots.txt")
        for s in sm_lines:
            if urlparse(s).netloc.lower() != site_host:
                au.add("Hoog", "Techniek", "robots-sitemap-host", f"Sitemap-regel wijst naar ander domein: {s}", "/robots.txt")
        if not demo:
            for bot in AI_SEARCH_BOTS:
                if bot_blocked_root(groups, bot):
                    au.add("Hoog", "AI-gereedheid", "bot-blocked", f"{bot} wordt geblokkeerd: geen zichtbaarheid in de bijbehorende zoek-/AI-dienst.", "/robots.txt")
            want_training = (cfg.get("aiCrawlers") or {}).get("training", "allow")
            for bot in AI_TRAINING_BOTS:
                blocked = bot_blocked_root(groups, bot)
                if want_training == "allow" and blocked:
                    au.add("Info", "AI-gereedheid", "train-blocked", f"{bot} (training) geblokkeerd, terwijl seo.config.json 'allow' zegt.", "/robots.txt")
                if want_training == "block" and not blocked:
                    au.add("Laag", "AI-gereedheid", "train-allowed", f"{bot} (training) niet geblokkeerd, terwijl seo.config.json 'block' zegt.", "/robots.txt")

    # ---------------- sitemap
    sm_urls: set[str] = set()
    sm_index = next((dist / n for n in ("sitemap-index.xml", "sitemap.xml") if (dist / n).exists()), None)
    if not sm_index:
        if not demo:
            au.add("Kritiek", "Techniek", "sitemap-missing", "Geen sitemap-index.xml of sitemap.xml.", "/", "Installeer @astrojs/sitemap en zet `site` in de config.")
    else:
        to_read = [sm_index]
        seen = set()
        ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
        while to_read:
            f = to_read.pop()
            if f in seen:
                continue
            if not f.exists():
                au.add("Kritiek", "Techniek", "sitemap-child-missing", f"Sitemap-index verwijst naar ontbrekend bestand: {f.name}", "/sitemap")
                continue
            seen.add(f)
            try:
                root = ET.parse(f).getroot()
            except Exception as e:
                au.add("Kritiek", "Techniek", "sitemap-parse", f"Sitemap {f.name} ongeldig: {e}", "/")
                continue
            for loc in root.iter(ns + "loc"):
                u = (loc.text or "").strip()
                if root.tag.endswith("sitemapindex"):
                    to_read.append(dist / urlparse(u).path[len(base):].lstrip("/"))
                else:
                    sm_urls.add(u)
        if not demo:
            sm_paths = set()
            for u in sm_urls:
                pu = urlparse(u)
                if pu.netloc.lower() != site_host:
                    au.add("Kritiek", "Techniek", "sitemap-host", f"Sitemap bevat URL op ander domein: {u}", "/sitemap")
                    continue
                sp = norm_path(pu.path)
                sm_paths.add(sp)
                if sp not in pages and (sp + "/") not in pages:
                    au.add("Hoog", "Techniek", "sitemap-404", f"Sitemap-URL bestaat niet in de build: {sp}", "/sitemap")
                elif sp in pages and (pages[sp]["noindex"] or pages[sp]["is404"]):
                    au.add("Hoog", "Techniek", "sitemap-noindex", f"Sitemap bevat noindex-pagina: {sp}", "/sitemap", "Filter in @astrojs/sitemap.")
                elif sp + "/" in pages:
                    au.add("Middel", "Techniek", "sitemap-slash", f"Sitemap-URL zonder slash: {sp}", "/sitemap")
            for u in indexable:
                if u not in sm_paths:
                    au.add("Middel", "Techniek", "sitemap-missing-page", "Indexeerbare pagina ontbreekt in de sitemap.", u)

    # ---------------- redirects (Astro meta refresh)
    redirect_paths = {u for u, d in pages.items() if d["p"].refresh is not None}
    for u in sorted(redirect_paths):
        m = re.search(r"url\s*=\s*['\"]?([^'\";]+)", pages[u]["p"].refresh or "", re.I)
        if not m:
            au.add("Hoog", "Techniek", "redirect-target", "Redirectpagina zonder doel-URL.", u)
            continue
        tu = urlparse(urljoin(site + u, m.group(1).strip()))
        if tu.netloc and tu.netloc.lower() != site_host:
            continue
        tp = norm_path(tu.path)
        if not resolves(tp):
            au.add("Kritiek", "Links", "redirect-404", f"Redirect wijst naar een pagina die niet bestaat: {tp}", u)
        elif tp in redirect_paths or (tp + "/") in redirect_paths:
            au.add("Hoog", "Links", "redirect-chain", f"Redirectketen: {u} -> {tp} is zelf ook een redirect.", u, "Laat de eerste redirect direct naar het eindadres wijzen.")
        if base and not tp.startswith(base + "/") and tp != base:
            au.add("Hoog", "Links", "redirect-base", f"Redirectdoel {tp} mist de base {base}.", u)

    # ---------------- overig
    if not demo:
        if not any(d["is404"] for d in pages.values()):
            au.add("Hoog", "Techniek", "no-404", "Geen 404.html: GitHub Pages toont dan zijn eigen foutpagina.", "/", "Maak src/pages/404.astro.")
        hp = pages.get(home)
        if hp and not hp["p"].icons:
            au.add("Middel", "On-page", "favicon", "Geen favicon gelinkt (Google toont dit in de zoekresultaten).", home)
        elif hp:
            for ic in hp["p"].icons:
                iu = urlparse(urljoin(site + home, ic))
                if iu.netloc.lower() == site_host:
                    rel_ic = iu.path[len(base):] if base and iu.path.startswith(base) else iu.path
                    if not (dist / unquote(rel_ic).lstrip("/")).exists():
                        au.add("Middel", "On-page", "favicon-404", f"Gelinkt icoon bestaat niet: {iu.path}", home,
                               "Maak favicon.svg, favicon-48x48.png en apple-touch-icon.png (180x180) in public/.")
        big = []
        for f in dist.rglob("*"):
            if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif") and f.stat().st_size > 400_000:
                big.append(f"{f.relative_to(dist).as_posix()} ({f.stat().st_size // 1024} KB)")
        if big:
            au.add("Middel", "Techniek", "img-heavy", f"{len(big)} afbeelding(en) > 400 KB: {', '.join(big[:4])}", "/",
                   "Zet bronfoto's in src/assets en gebruik <Image>/<Picture> (avif/webp).")
        pdfs = [f.relative_to(dist).as_posix() for f in dist.rglob("*.pdf")]
        if pdfs and cfg.get("branche") in ("restaurant", "horeca"):
            au.add("Middel", "AI-gereedheid", "menu-pdf", f"PDF('s) gevonden ({', '.join(pdfs[:3])}). Staat het menu ook als HTML-tekst op de site?", "/")

    meta = {
        "pages_total": len(pages), "indexable": len(indexable), "sitemap_urls": len(sm_urls),
        "schema_types": sorted(all_types), "demo": demo, "strategy": sorted(strategy),
    }
    return au, meta


# --------------------------------------------------------------------------- rapport
def scores(issues: list[dict]) -> dict[str, int]:
    seen: dict[tuple, int] = defaultdict(int)
    for i in issues:
        seen[(i["cat"], i["code"], i["sev"])] += 1
    pen: dict[str, float] = defaultdict(float)
    for (cat, code, sev), n in seen.items():
        w = SEV_WEIGHT[sev]
        pen[cat] += w + min(n - 1, 4) * w * 0.25
    return {c: max(0, round(100 - pen.get(c, 0))) for c in CATEGORIES}


def total_score(sc: dict[str, int], counts: dict[str, int]) -> int:
    """Gemiddelde van de categorieën, maar een Kritiek-bevinding houdt de score onder 70
    en een Hoog-bevinding onder 90: één kapotte canonical is erger dan tien kleine puntjes."""
    t = round(sum(sc.values()) / len(sc))
    if counts.get("Kritiek"):
        t = min(t, 69)
    elif counts.get("Hoog"):
        t = min(t, 89)
    return t


def render(au: Audit, meta: dict, site: str) -> str:
    sc = scores(au.issues)
    counts = defaultdict(int)
    for i in au.issues:
        counts[i["sev"]] += 1
    total = total_score(sc, counts)
    out = [f"# SEO-audit {site}", ""]
    out.append(f"Pagina's: {meta['pages_total']} (indexeerbaar {meta['indexable']}), sitemap-URL's: {meta['sitemap_urls']}, "
               f"strategie: {', '.join(meta['strategy'])}{' (DEMOMODUS)' if meta['demo'] else ''}")
    out.append(f"Schema-types: {', '.join(meta['schema_types']) or 'geen'}")
    out.append("")
    out.append(f"**Totaalscore: {total}/100**  (Kritiek {counts['Kritiek']}, Hoog {counts['Hoog']}, Middel {counts['Middel']}, Laag {counts['Laag']}, Info {counts['Info']})")
    out.append("")
    out.append("| Categorie | Score |")
    out.append("|---|---|")
    for c in CATEGORIES:
        out.append(f"| {c} | {sc[c]} |")
    out.append("")
    # groepeer op (sev, code, msg-zonder-pagina)
    grouped: dict[tuple, dict] = {}
    for i in au.issues:
        key = (i["sev"], i["cat"], i["code"], i["msg"])
        g = grouped.setdefault(key, {"pages": [], "fix": i["fix"]})
        g["pages"].append(i["page"])
    by_code: dict[tuple, dict] = {}
    for (sev, cat, code, msg), g in grouped.items():
        k = (sev, cat, code)
        e = by_code.setdefault(k, {"msgs": [], "fix": g["fix"]})
        e["msgs"].append((msg, g["pages"]))
    for sev in ("Kritiek", "Hoog", "Middel", "Laag", "Info"):
        rows = [(k, v) for k, v in by_code.items() if k[0] == sev]
        if not rows:
            continue
        out.append(f"## {sev}")
        out.append("")
        for (s, cat, code), v in sorted(rows, key=lambda x: (x[0][1], x[0][2])):
            msgs = v["msgs"]
            if len(msgs) == 1:
                msg, pages = msgs[0]
                pg = ", ".join(sorted(set(pages))[:6]) + (f" (+{len(set(pages)) - 6})" if len(set(pages)) > 6 else "")
                out.append(f"- [{cat}] {msg}  \n  Pagina: {pg}")
            else:
                allp = sorted({p for _, ps in msgs for p in ps})
                out.append(f"- [{cat}] {msgs[0][0]}  \n  ({len(msgs)} varianten, o.a. op {', '.join(allp[:6])}{' ...' if len(allp) > 6 else ''})")
            if v["fix"]:
                out.append(f"  Fix: {v['fix']}")
        out.append("")
    if not au.issues:
        out.append("Geen bevindingen. Netjes.")
    return "\n".join(out)


def main() -> None:
    try:  # Windows: stdout-redirect is anders cp1252 en crasht op emoji/→ in titles
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="Statische SEO-audit van een Astro dist/-map")
    ap.add_argument("--dist", default="dist")
    ap.add_argument("--config", default="seo.config.json")
    ap.add_argument("--out", help="schrijf Markdown-rapport naar dit bestand")
    ap.add_argument("--json", help="schrijf bevindingen als JSON")
    ap.add_argument("--fail-on", default="hoog", choices=["kritiek", "hoog", "middel", "none"])
    o = ap.parse_args()

    cfg_path = Path(o.config)
    if not cfg_path.exists():
        print(f"FOUT: {cfg_path} niet gevonden. Maak eerst seo.config.json (zie assets/templates/seo.config.example.json).", file=sys.stderr)
        sys.exit(2)
    cfg = json.loads(cfg_path.read_text(encoding="utf-8-sig"))
    dist = Path(o.dist)
    if not dist.is_dir():
        print(f"FOUT: map {dist} bestaat niet. Draai eerst `npm run build`.", file=sys.stderr)
        sys.exit(2)

    try:
        au, meta = run(dist, cfg)
    except Exception:  # crash != bevindingen: exit 3, zodat CI het verschil ziet
        import traceback
        traceback.print_exc()
        sys.exit(3)
    report = render(au, meta, cfg.get("site", ""))
    if o.out:
        Path(o.out).parent.mkdir(parents=True, exist_ok=True)
        Path(o.out).write_text(report + "\n", encoding="utf-8")
        print(f"Rapport geschreven naar {o.out}")
    else:
        print(report)
    if o.json:
        sc = scores(au.issues)
        cnt = defaultdict(int)
        for i in au.issues:
            cnt[i["sev"]] += 1
        Path(o.json).parent.mkdir(parents=True, exist_ok=True)
        Path(o.json).write_text(json.dumps({"meta": meta, "total": total_score(sc, cnt), "scores": sc, "counts": cnt, "issues": au.issues},
                                           ensure_ascii=False, indent=2), encoding="utf-8")

    if o.fail_on != "none":
        limit = {"kritiek": 0, "hoog": 1, "middel": 2}[o.fail_on]
        if any(SEV_ORDER[i["sev"]] <= limit for i in au.issues):
            sys.exit(1)


if __name__ == "__main__":
    main()
