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
STREAM = "__STREAM__"  # {% include_block %}: may hold other blocks, not just rich text
BLOCKS_PY = ROOT / "cms/pages/blocks.py"
RICH_TEXT_TAGS = {"p", "b", "i", "em", "a", "br"}  # what Draftail can emit with the site's features
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
    """Template tags -> removed (both branches kept), vars -> VAR, include_block -> STREAM."""
    src = re.sub(r"{#.*?#}", "", src, flags=re.S)
    src = re.sub(r"{%\s*include_block\b.*?%}", STREAM, src)
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
        self.slots = {}  # path -> VAR (rich text) or STREAM (include_block)
        self.lines = {}  # path -> first source line


class Skeleton(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.source = source
        self.stack = []  # (tag, path, component, in_text, line)
        self.components = []
        self.ids = []  # (id, line)
        self.refs = []  # (attr, target, line)
        self.nesting = []  # (line, message): unclosed or stray tags

    def handle_starttag(self, tag, attr_list):
        attrs = {k: (v or "") for k, v in attr_list}
        parent = self.stack[-1] if self.stack else None
        in_text = bool(parent and (parent[3] or parent[0] in TEXT_CONTAINERS))
        key = attrs.get("data-is") or (tag if tag in LANDMARKS else None)
        line = self.getpos()[0]

        if "id" in attrs:
            self.ids.append((attrs["id"], line))
        for ref in ("aria-controls", "popovertarget", "href"):
            target = attrs.get(ref, "")
            if ref == "href":
                target = target[1:] if target.startswith("#") and len(target) > 1 else ""
            if target:
                self.refs.append((ref, target, line))

        sig = signature(tag, attrs)
        if parent and parent[2] and (not in_text or "data-is" in attrs):
            path = f"{parent[1]}>{sig}"
            parent[2].paths[path].update({} if key else attrs)
            parent[2].lines.setdefault(path, line)
        else:
            path = sig if parent is None or not parent[2] else parent[1]

        comp = parent[2] if parent else None
        if key:
            comp = Component(key, self.source)
            comp.paths["."].update(attrs)
            comp.lines["."] = line
            self.components.append(comp)
            path = "."
        if tag not in VOID:
            self.stack.append((tag, path, comp, in_text, line))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and self.stack:
            self.stack.pop()

    def handle_endtag(self, tag):
        line = self.getpos()[0]
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for open_tag, *_, open_line in self.stack[i + 1:]:
                    self.nesting.append((open_line, f"<{open_tag}> is never closed (implicitly closed by </{tag}> on line {line})"))
                del self.stack[i:]
                return
        self.nesting.append((line, f"</{tag}> has no matching open tag"))

    def close(self):
        super().close()
        for open_tag, *_, open_line in self.stack:
            self.nesting.append((open_line, f"<{open_tag}> is never closed"))

    def handle_data(self, data):
        kind = data.strip()
        if self.stack and kind in (VAR, STREAM):
            tag, path, comp, in_text, _ = self.stack[-1]
            if comp and not in_text and tag not in TEXT_CONTAINERS:
                add_slot(comp.slots, path, kind)


def add_slot(slots, path, kind):
    if slots.get(path) != STREAM:
        slots[path] = kind


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
        for path, kind in c.slots.items():
            add_slot(m.slots, path, kind)
        for path, line in c.lines.items():
            m.lines.setdefault(path, line)
    return merged


# --- source locations -------------------------------------------------------
# Templates are parsed after inlining, so their lines are found again in the raw files.

def template_files():
    return [(f.relative_to(ROOT), f.read_text().splitlines()) for d in TEMPLATE_DIRS for f in sorted(d.rglob("*.html"))]


def matches(text, segment):
    tag, attrs = re.match(r"([\w-]+)(.*)", segment).groups()
    if not re.search(rf"<{tag}[\s>/]", text):
        return False
    return all(f'{k}="{v}"' in text if v else f" {k}" in text
               for k, v in re.findall(r"\[([\w-]+)(?:=([^\]]*))?\]", attrs))


def template_location(files, key, path="."):
    hits = [(name, i) for name, lines in files for i, text in enumerate(lines)
            if (re.search(rf"<{key}[\s>]", text) if key in LANDMARKS else f'data-is="{key}"' in text)]
    if not hits:
        return "template ?"
    name, start = next(((n, i) for n, i in hits if n.stem == key), hits[0])
    lines = dict(files)[name]
    seg = path.rsplit(">", 1)[-1]
    if path != ".":
        start = next((i for i in range(start, len(lines)) if matches(lines[i], seg)), start)
    return f"{name}:{start + 1}"


def demo_location(comp, path="."):
    return f"index.html:{comp.lines.get(path, comp.lines['.'])}"


# --- comparison -------------------------------------------------------------

def is_var(value):
    return VAR in value


def slot_kind(path, slots):
    """STREAM if any enclosing slot is an include_block, VAR if only rich text, None if no slot."""
    kinds = {k for s, k in slots.items() if s == "." or path == s or path.startswith(s + ">")}
    return STREAM if STREAM in kinds else (VAR if kinds else None)


def producible(path, kind, rich_text, components):
    """Could the slot emit this element: a rich-text mark on its own tag, or (stream only) a templated block?"""
    seg = path.rsplit(">", 1)[-1]
    tag = re.match(r"[\w-]+", seg).group()
    data_is = re.search(r"\[data-is=([\w-]+)\]", seg)
    if not data_is:
        return tag in RICH_TEXT_TAGS
    key = data_is.group(1)
    if key in rich_text:
        return rich_text[key] == tag
    return kind == STREAM and key in components


def compare(demo, tmpl, rich_text):
    warn, info = [], []
    files = template_files()

    def at(key, path=".", demo_path=None, tmpl_path=None):
        d = demo_location(demo[key], demo_path or path) if key in demo else None
        t = template_location(files, key, tmpl_path or path) if key in tmpl else None
        return "  (" + " · ".join(x for x in (d, t) if x) + ")"

    for key in sorted(demo.keys() - tmpl.keys()):
        if key in rich_text:
            info.append(f"[{key}] rendered by a rich-text feature, not a template" + at(key))
        else:
            warn.append(f"[{key}] in index.html only — no template renders it" + at(key))
    for key in sorted(tmpl.keys() - demo.keys()):
        info.append(f"[{key}] in templates only — not demoed in index.html" + at(key))

    for key in sorted(demo.keys() & tmpl.keys()):
        d, t = demo[key], tmpl[key]
        for path in sorted(d.paths.keys() - t.paths.keys()):
            msg = f"[{key}] {path}: in index.html, not in template"
            kind = slot_kind(path, t.slots)
            if not kind:
                warn.append(msg + at(key, demo_path=path, tmpl_path="."))
            elif producible(path, kind, rich_text, tmpl.keys()):
                info.append(msg + " (may come from a CMS slot)" + at(key, demo_path=path, tmpl_path="."))
            else:
                warn.append(msg + " (a CMS slot can't produce it)" + at(key, demo_path=path, tmpl_path="."))
        for path in sorted(t.paths.keys() - d.paths.keys()):
            warn.append(f"[{key}] {path}: in template, not in index.html" + at(key, demo_path=".", tmpl_path=path))
        for path in sorted(d.paths.keys() & t.paths.keys()):
            da, ta = d.paths[path], t.paths[path]
            loc = at(key, path)
            for attr in sorted(da.keys() - ta.keys()):
                warn.append(f"[{key}] {path}: @{attr} only in index.html" + loc)
            for attr in sorted(ta.keys() - da.keys()):
                (info if attr == "id" and is_var(ta[attr]) else warn).append(f"[{key}] {path}: @{attr} only in template" + loc)
            for attr in sorted(da.keys() & ta.keys()):
                if attr in VOLATILE_ATTRS or is_var(ta[attr]) or attr == "id":
                    continue
                if da[attr] != ta[attr]:
                    warn.append(f'[{key}] {path}: @{attr} "{da[attr]}" (index.html) vs "{ta[attr]}" (template)' + loc)
    return warn, info


def check_demo_nesting(demo):
    return [f"index.html:{line}: {msg}" for line, msg in sorted(demo.nesting)]


def check_demo_refs(demo):
    warn = []
    ids = [i for i, _ in demo.ids]
    for value, line in demo.ids:
        if ids.count(value) > 1:
            warn.append(f'index.html:{line}: duplicate id="{value}"')
    for attr, target, line in demo.refs:
        if target not in ids:
            warn.append(f'index.html:{line}: {attr}="{target}" has no matching id')
    return warn


def check_block_ids():
    warn = []
    for f in sorted(template_path(BLOCKS).glob("*.html")):
        for n, text in enumerate(f.read_text().splitlines(), 1):
            for value in set(re.findall(r'\bid="([^"{]+)"', text)) - ALLOWED_BLOCK_IDS:
                warn.append(f'{f.relative_to(ROOT)}:{n}: hardcoded id="{value}" — duplicates if the block is used twice; may shadow a divider anchor')
    return warn


def optional_fields():
    """Block template name -> field names declared required=False on its block (and nested structs)."""
    src = BLOCKS_PY.read_text()
    classes = dict(re.findall(r"^class (\w+)\(.*?\):\n(.*?)(?=^class |\Z)", src, re.S | re.M))

    def fields(name, seen=()):
        body = classes[name]
        found = {name for name, args in re.findall(r"^\s+(\w+) = [\w.]+\(((?:[^()]|\([^()]*\))*)\)", body, re.M)
                 if "required=False" in args}
        for child in re.findall(r"\b(\w+)\(\)", body):
            if child in classes and child not in seen:
                found |= fields(child, seen + (name,))
        return found

    return {m.group(1): fields(name) for name, body in classes.items()
            if (m := re.search(r'template = "pages/blocks/([\w.]+)"', body))}


def check_unguarded_optionals():
    """An optional field printed as an element's only content, outside {% if %}, leaves an empty element."""
    warn = []
    for name, optional in optional_fields().items():
        f = template_path(f"{BLOCKS}/{name}")
        src, depth = f.read_text(), 0
        for token in re.finditer(r"{%\s*(if|endif)\b.*?%}|>\s*{{\s*(?:value|row)\.(\w+)[^}]*}}\s*<", src):
            if token.group(1):
                depth += 1 if token.group(1) == "if" else -1
            elif depth == 0 and token.group(2) in optional:
                line = src.count("\n", 0, token.start()) + 1
                warn.append(f"{f.relative_to(ROOT)}:{line}: optional field '{token.group(2)}' printed without {{% if %}} — renders an empty element when blank")
    return warn


def rich_text_keys():
    """data-is value -> element tag, for the inline marks registered in wagtail_hooks.py."""
    src = (ROOT / "cms/pages/wagtail_hooks.py").read_text()
    return {key: tag for tag, key in re.findall(r'"element":\s*"(\w+)",\s*"props":\s*{"data-is":\s*"([\w-]+)"', src)}


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
    warn += check_demo_nesting(demo) + check_demo_refs(demo) + check_block_ids() + check_unguarded_optionals()
    info += check_vocabulary(demo_comps.keys() | tmpl_comps.keys())

    for label, items in (("WARN", warn), ("INFO", info)):
        for line in items:
            print(f"{label}  {line}")
    print(f"\n{len(warn)} warning(s), {len(info)} note(s)")
    sys.exit(1 if warn and "--strict" in sys.argv else 0)


if __name__ == "__main__":
    main()
