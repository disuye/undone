#!/usr/bin/env python3
"""Compare the static demo (index.html) against the Wagtail templates.

Components are matched by `data-is` (plus landmark tags), and each is reduced to
a structural skeleton: element paths and their attributes, ignoring text and
CMS-variable values. Usage: _scripts/markup_drift.py [--strict]
"""
import re
import sys
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "index.html"
TEMPLATE_DIRS = [ROOT / "cms/templates", ROOT / "cms/pages/templates"]
PAGES = ["pages/home_page.html", "pages/content_page.html"]
BLOCKS = "pages/blocks"
STYLE_GLOBS = ["assets/css/*.css", "assets/js/**/*.js"]

# Hardcoded ids accepted in block templates (block is used once per page by convention).
ALLOWED_BLOCK_IDS = {"contact-form"}

VAR = "__VAR__"
LANDMARKS = {"head", "body", "header", "nav", "main", "footer"}
TEXT_CONTAINERS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "a", "button", "li", "label", "figcaption", "i", "b", "em", "strong", "span"}
VOID = {"meta", "link", "img", "input", "br", "hr", "source", "wbr"}
SIGNATURE_ATTRS = ("data-is", "role", "type", "name", "rel", "property", "popover")
VOLATILE_ATTRS = {"href", "src", "alt", "width", "height", "content", "action", "aria-label", "sizes"}


# --- template preprocessing -------------------------------------------------

def template_path(name):
    for d in TEMPLATE_DIRS:
        if (d / name).exists():
            return d / name
    raise FileNotFoundError(name)


def resolve_template(name):
    """Inline {% extends %} blocks and static {% include %}s; leave other tags."""
    src = template_path(name).read_text()
    parent = re.search(r'{%\s*extends\s+"([^"]+)"\s*%}', src)
    if parent:
        child_blocks = dict(re.findall(r"{%\s*block\s+(\w+)\s*%}(.*?){%\s*endblock\s*%}", src, re.S))
        base = resolve_template(parent.group(1))
        src = re.sub(
            r"{%\s*block\s+(\w+)\s*%}(.*?){%\s*endblock\s*%}",
            lambda m: child_blocks.get(m.group(1), m.group(2)),
            base, flags=re.S,
        )
    return re.sub(r'{%\s*include\s+"([^"]+)"[^%]*%}', lambda m: resolve_template(m.group(1)), src)


def strip_django(src):
    """Template tags -> removed (both branches kept), vars -> VAR, include_block -> slot."""
    src = re.sub(r"{#.*?#}", "", src, flags=re.S)
    src = re.sub(r"{%\s*include_block\b.*?%}", VAR, src)
    src = re.sub(r"{%.*?%}", "", src, flags=re.S)
    return re.sub(r"{{.*?}}", VAR, src, flags=re.S)


# --- skeleton extraction ----------------------------------------------------

def signature(tag, attrs):
    parts = [tag] + [f"[{k}={attrs[k]}]" if attrs[k] else f"[{k}]" for k in SIGNATURE_ATTRS if k in attrs]
    return "".join(parts)


class Component:
    def __init__(self, key, source):
        self.key, self.source = key, source
        self.paths = defaultdict(dict)  # path -> {attr: value}
        self.slots = set()  # paths containing a CMS slot (rich text / include_block)


class Skeleton(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.source = source
        self.stack = []  # (tag, path, component, in_text)
        self.components = []
        self.ids = []
        self.refs = []  # (attr, target)

    def handle_starttag(self, tag, attr_list):
        attrs = {k: (v or "") for k, v in attr_list}
        parent = self.stack[-1] if self.stack else None
        in_text = bool(parent and (parent[3] or parent[0] in TEXT_CONTAINERS))
        key = attrs.get("data-is") or (tag if tag in LANDMARKS else None)

        if "id" in attrs:
            self.ids.append(attrs["id"])
        for ref in ("aria-controls", "popovertarget", "href"):
            target = attrs.get(ref, "")
            if ref == "href":
                target = target[1:] if target.startswith("#") and len(target) > 1 else ""
            if target:
                self.refs.append((ref, target))

        sig = signature(tag, attrs)
        if parent and parent[2] and (not in_text or "data-is" in attrs):
            path = f"{parent[1]}>{sig}"
            parent[2].paths[path].update({} if key else attrs)
        else:
            path = sig if parent is None or not parent[2] else parent[1]

        comp = parent[2] if parent else None
        if key:
            comp = Component(key, self.source)
            comp.paths["."].update(attrs)
            self.components.append(comp)
            path = "."
        if tag not in VOID:
            self.stack.append((tag, path, comp, in_text))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and self.stack:
            self.stack.pop()

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        if self.stack and data.strip() == VAR:
            tag, path, comp, in_text = self.stack[-1]
            if comp and not in_text and tag not in TEXT_CONTAINERS:
                comp.slots.add(path)


def parse(src, source):
    p = Skeleton(source)
    p.feed(src)
    p.close()
    return p


def merge(components):
    merged = {}
    for c in components:
        m = merged.setdefault(c.key, Component(c.key, c.source))
        for path, attrs in c.paths.items():
            m.paths[path].update(attrs)
        m.slots |= c.slots
    return merged


# --- comparison -------------------------------------------------------------

def is_var(value):
    return VAR in value


def under_slot(path, slots):
    return any(s == "." or path == s or path.startswith(s + ">") for s in slots)


def compare(demo, tmpl, rich_text):
    warn, info = [], []
    for key in sorted(demo.keys() - tmpl.keys()):
        if key in rich_text:
            info.append(f"[{key}] rendered by a rich-text feature, not a template")
        else:
            warn.append(f"[{key}] in index.html only — no template renders it")
    for key in sorted(tmpl.keys() - demo.keys()):
        info.append(f"[{key}] in templates only — not demoed in index.html")

    for key in sorted(demo.keys() & tmpl.keys()):
        d, t = demo[key], tmpl[key]
        for path in sorted(d.paths.keys() - t.paths.keys()):
            msg = f"[{key}] {path}: in index.html, not in template"
            (info if under_slot(path, t.slots) else warn).append(msg + (" (may come from a CMS slot)" if under_slot(path, t.slots) else ""))
        for path in sorted(t.paths.keys() - d.paths.keys()):
            warn.append(f"[{key}] {path}: in template, not in index.html")
        for path in sorted(d.paths.keys() & t.paths.keys()):
            da, ta = d.paths[path], t.paths[path]
            for attr in sorted(da.keys() - ta.keys()):
                warn.append(f"[{key}] {path}: @{attr} only in index.html")
            for attr in sorted(ta.keys() - da.keys()):
                (info if attr == "id" and is_var(ta[attr]) else warn).append(f"[{key}] {path}: @{attr} only in template")
            for attr in sorted(da.keys() & ta.keys()):
                if attr in VOLATILE_ATTRS or is_var(ta[attr]) or attr == "id":
                    continue
                if da[attr] != ta[attr]:
                    warn.append(f'[{key}] {path}: @{attr} "{da[attr]}" (index.html) vs "{ta[attr]}" (template)')
    return warn, info


def check_demo_refs(demo):
    warn = []
    ids = demo.ids
    for dup in sorted({i for i in ids if ids.count(i) > 1}):
        warn.append(f'index.html: duplicate id="{dup}"')
    for attr, target in demo.refs:
        if target not in ids:
            warn.append(f'index.html: {attr}="{target}" has no matching id')
    return warn


def check_block_ids():
    warn = []
    for f in sorted(template_path(BLOCKS).glob("*.html")):
        for value in set(re.findall(r'\bid="([^"{]+)"', f.read_text())) - ALLOWED_BLOCK_IDS:
            warn.append(f'{f.relative_to(ROOT)}: hardcoded id="{value}" — duplicates if the block is used twice; may shadow a divider anchor')
    return warn


def rich_text_keys():
    return set(re.findall(r'"data-is":\s*"([\w-]+)"', (ROOT / "cms/pages/wagtail_hooks.py").read_text()))


def check_vocabulary(keys):
    known = set()
    for pattern in STYLE_GLOBS:
        for f in ROOT.glob(pattern):
            known |= set(re.findall(r'data-is[~|^$*]?=\\?["\']?([\w-]+)', f.read_text()))
    return [f"[{k}] has no data-is selector in CSS/JS" for k in sorted(keys - known - LANDMARKS)]


# --- main -------------------------------------------------------------------

def main():
    demo = parse(DEMO.read_text(), "index.html")
    template_parsers = [parse(strip_django(resolve_template(name)), name) for name in PAGES]
    template_parsers += [
        parse(strip_django(resolve_template(f"{BLOCKS}/{f.name}")), f.name)
        for f in sorted(template_path(BLOCKS).glob("*.html"))
    ]

    demo_comps = merge(demo.components)
    tmpl_comps = merge(c for p in template_parsers for c in p.components)

    warn, info = compare(demo_comps, tmpl_comps, rich_text_keys())
    warn += check_demo_refs(demo) + check_block_ids()
    info += check_vocabulary(demo_comps.keys() | tmpl_comps.keys())

    for label, items in (("WARN", warn), ("INFO", info)):
        for line in items:
            print(f"{label}  {line}")
    print(f"\n{len(warn)} warning(s), {len(info)} note(s)")
    sys.exit(1 if warn and "--strict" in sys.argv else 0)


if __name__ == "__main__":
    main()
