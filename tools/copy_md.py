#!/usr/bin/env python3
"""Generate copy.md — the labelled copy-review document — from the pages.

Written in Python rather than in build.mjs because Node has no built-in
HTML parser, and a five-page static site with no build step should not
grow an npm dependency just to read its own markup. Regex cannot do this
job: nested same-name tags (a <div> inside a <div>) defeat it, which is
exactly how the first attempt at this produced a document missing most
of the copy.

Run via `node tools/build.mjs`, or on its own: python3 tools/copy_md.py
"""
import json, os, re
from html.parser import HTMLParser
from html import unescape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = json.load(open(os.path.join(ROOT, 'tools/content.json'), encoding='utf-8'))

# Label for a leaf, taken from its own class so an edit maps back to markup.
LABELS = {
    'lead': 'Lead', 'mono': 'Kicker',
    'h2--sub': 'Framing sentence', 'ladder__hint': 'Note', 'ladder__note': 'Note',
    'toc__n': 'Count', 'toc__lab': 'Count label',
    'pcard__n': 'Number', 'phase__n': 'Phase number', 'phase__meta': 'Phase meta',
    'verb__lab': 'Step label', 'verb__name': 'Verb',
    'scard__h': 'Heading', 'scard__b': 'Body', 'scard__links': 'Cross-links',
    'ocard__tag': 'Tag', 'ocard__aud': 'Audience', 'ocard__phases': 'Phases',
    'ocard__more': 'Card link', 'hours': 'Hours',
    'ydelse__kicker': 'Kicker', 'ydelse__aud': 'Audience', 'backlink': 'Back link',
    'nextup__lab': 'Next label', 'nextup__go': 'Next link',
    'btn': 'Button', 'footer__mark': 'Wordmark',
    'phase__points': None, 'trio': None, 'trio__cell': None,
}
VOID = {'meta','link','img','br','hr','input','col','source','path','circle','use','area','embed'}
SKIP = {'script','style','svg','canvas','head','nav','footer','caption'}
BLOCK_LEAF = {'h1','h2','h3','h4','p','li','span','b','strong','em','a','div','td','th'}


class Node:
    """`items` keeps text and child elements in source order — concatenating
    a node's own text before its children collapses "på <span>autopilot</span>
    og" into "på og" + "autopilot", which is how the first version mangled
    the hero headline."""
    __slots__ = ('tag', 'cls', 'items', 'parent')
    def __init__(self, tag, cls='', parent=None):
        self.tag, self.cls, self.items, self.parent = tag, cls, [], parent

    @property
    def kids(self):
        return [i for i in self.items if isinstance(i, Node)]


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('#root')
        self.cur = self.root
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if self.skip_depth:
            if tag not in VOID:
                self.skip_depth += 1
            return
        if tag in SKIP:
            self.skip_depth = 1
            return
        if tag in VOID:
            return
        a = dict(attrs)
        n = Node(tag, a.get('class', ''), self.cur)
        self.cur.items.append(n)
        self.cur = n

    def handle_endtag(self, tag):
        if self.skip_depth:
            self.skip_depth -= 1
            return
        if tag in VOID:
            return
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        if self.skip_depth or not data.strip():
            return
        self.cur.items.append(data)


def flat_text(n):
    """All text under n in source order, soft hyphens dropped, space collapsed."""
    out = [i if isinstance(i, str) else flat_text_raw(i) for i in n.items]
    return re.sub(r'\s+', ' ', ''.join(out).replace('\u00ad', '')).strip()


def flat_text_raw(n):
    return ''.join(i if isinstance(i, str) else flat_text_raw(i) for i in n.items)


def label_for(n):
    for c in n.cls.split():
        if c in LABELS:
            return LABELS[c]
    if n.tag in ('h1', 'h2', 'h3', 'h4'):
        return n.tag.upper()
    return {'p': 'Paragraph', 'li': 'Bullet', 'a': 'Link',
            'td': 'Cell', 'th': 'Header cell'}.get(n.tag)


def collect(n, out):
    """A leaf is an element with text and no child that itself has text."""
    kids_with_text = [k for k in n.kids if flat_text(k)]
    if n.tag in BLOCK_LEAF or n.tag in ('td', 'th'):
        if not kids_with_text or all(k.tag in ('span', 'b', 'strong', 'em', 'i', 'a')
                                     and not k.kids for k in kids_with_text):
            t = flat_text(n)
            lab = label_for(n)
            if t and lab:
                out.append((lab, t))
                return
    for k in n.kids:
        collect(k, out)


def sections(page_html):
    t = Tree(); t.feed(page_html)
    main = None
    def find(n):
        nonlocal main
        if n.tag == 'main':
            main = n
        for k in n.kids:
            if main is None:
                find(k)
    find(t.root)
    if main is None:
        return []
    blocks = [k for k in main.kids if k.tag in ('section', 'header', 'article')]
    # a single <article> wrapper (the Ydelse pages) — descend one level
    if len(blocks) == 1 and blocks[0].tag == 'article':
        blocks = [k for k in blocks[0].kids if k.tag in ('section', 'header')]
    return blocks


parts = ["""# Cloud Deliberate — site copy

All current copy on the site, in page order. Edit the text under each label
and send it back — keep the labels intact so the edits map back to the right
element. Everything else (CSS, layout, the 3D marks) is unaffected by this
file.

**This file is generated.** `node tools/build.mjs` rewrites it from the pages,
so editing it in place will not change the site. It exists to be read and
marked up, not to be a source.

Danish throughout.
"""]

for p in M['pages']:
    html = open(os.path.join(ROOT, p['file']), encoding='utf-8').read()
    parts.append(f"\n---\n\n## {p['path']}\n\n**Browser tab title**\n{p['title']}\n"
                 f"\n**Meta description**\n{p['description']}\n")
    for b in sections(html):
        items = []
        collect(b, items)
        if not items:
            continue
        name = next((t for lab, t in items if lab in ('H1', 'H2')), 'Sektion')
        parts.append(f"\n### {name}\n")
        for lab, t in items:
            parts.append(f"\n**{lab}**\n{t}\n")

open(os.path.join(ROOT, 'copy.md'), 'w', encoding='utf-8').write(''.join(parts))
print('✓ copy.md')
