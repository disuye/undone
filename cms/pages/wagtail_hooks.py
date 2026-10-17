"""Site-specific inline marks for rich text (see build-spec: Inline elements).

Wagtail's default bold/italic emit <b>/<i>, which this site reserves for the
brand word and upright highlights, so the editor uses these instead.
"""

from wagtail import hooks
from wagtail.admin.rich_text.converters.html_to_contentstate import InlineStyleElementHandler
from wagtail.admin.rich_text.editors.draftail.features import InlineStyleFeature

ZH = "zh-Hant-HK"

INLINE_MARKS = [
    # feature, style type, label, toolbar text, db element, db selector, editor style
    ("brand", "BRAND", "Brand word (undone)", "U", {"element": "b"}, "b",
     {"fontWeight": "900", "fontVariant": "small-caps"}),
    ("highlight", "HIGHLIGHT", "Highlight", "H", {"element": "i", "props": {"data-is": "highlight"}},
     'i[data-is="highlight"]', {"backgroundColor": "#FDFD0D", "fontStyle": "normal"}),
    ("zh", "ZH", "Chinese (Hong Kong)", "中", {"element": "i", "props": {"lang": ZH}},
     f'i[lang="{ZH}"]', {"fontStyle": "normal", "textDecoration": "underline dotted"}),
    ("emphasis", "EMPHASIS", "Emphasis (italic)", "em", {"element": "em"}, "em",
     {"fontStyle": "italic"}),
]


@hooks.register("register_rich_text_features")
def register_inline_marks(features):
    for name, style, description, label, db_element, selector, editor_style in INLINE_MARKS:
        features.register_editor_plugin(
            "draftail",
            name,
            InlineStyleFeature({"type": style, "label": label, "description": description, "style": editor_style}),
        )
        features.register_converter_rule(
            "contentstate",
            name,
            {
                "from_database_format": {selector: InlineStyleElementHandler(style)},
                "to_database_format": {"style_map": {style: db_element}},
            },
        )
