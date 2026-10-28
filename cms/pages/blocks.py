"""StreamField blocks: one top-level block per `data-is` used inside <main>.

Each block renders the same markup as the static prototype (index.html), so
layout rules in style.css (nth-child of article/figure) apply unchanged.
"""

import re

from django.utils.safestring import mark_safe
from wagtail import blocks
from wagtail.images.blocks import ImageChooserBlock
from wagtail.rich_text import RichText

RICH_TEXT = ["brand", "highlight", "zh", "emphasis", "link"]
PARAGRAPH_EDGES = re.compile(r"^<p>|</p>$")


class InlineRichText(RichText):
    """Rich text without its <p> wrapper, so it can sit inside headings, labels and links."""

    def __html__(self):
        html = PARAGRAPH_EDGES.sub("", super().__html__().strip())
        return mark_safe(html.replace("</p><p>", "<br>"))


class InlineTextBlock(blocks.RichTextBlock):
    """Short text whose only mark is 中 (zh-Hant-HK); replaces CharBlock/TextBlock in visible slots."""

    def __init__(self, **kwargs):
        super().__init__(features=["zh"], **kwargs)

    def _inline(self, value):
        return InlineRichText(value.source)

    def to_python(self, value):
        return self._inline(super().to_python(value))

    def normalize(self, value):
        return self._inline(super().normalize(value))

    def value_from_form(self, value):
        return self._inline(super().value_from_form(value))


class CTAValue(blocks.StructValue):
    def href(self):
        page = self.get("page")
        return page.url if page else self.get("url") or "#"


class CTABlock(blocks.StructBlock):
    label = InlineTextBlock(required=False, help_text="Leave empty for no link.")
    page = blocks.PageChooserBlock(required=False)
    url = blocks.CharBlock(required=False, help_text="External URL or #anchor; used when no page is chosen.")

    class Meta:
        value_class = CTAValue
        label = "Call to action"


class DividerBlock(blocks.StructBlock):
    heading = InlineTextBlock()
    anchor = blocks.RegexBlock(
        regex=r"^[a-z0-9-]+$",
        required=False,
        help_text="Optional in-page id, e.g. 'about'. Listed in the menu.",
        error_messages={"invalid": "Lowercase letters, numbers and hyphens only."},
    )

    class Meta:
        icon = "title"
        label = "Divider"
        template = "pages/blocks/divider.html"


class CardBlock(blocks.StructBlock):
    meta = blocks.CharBlock(required=False, help_text="Mono label, e.g. 'PRJ-014 · Audio · Ongoing'.")
    heading = InlineTextBlock()
    standfirst = InlineTextBlock(required=False)
    image = ImageChooserBlock(required=False)
    body = blocks.RichTextBlock(features=RICH_TEXT, required=False)
    cta = CTABlock()

    class Meta:
        icon = "doc-full"
        label = "Card"
        template = "pages/blocks/card.html"


class PhotoBlock(blocks.StructBlock):
    image = ImageChooserBlock()
    alt = blocks.CharBlock(required=False, help_text="Overrides the image's own alt text.")
    caption = InlineTextBlock(required=False)

    class Meta:
        icon = "image"
        label = "Photo"
        template = "pages/blocks/photo.html"


class QuoteBlock(blocks.StructBlock):
    text = InlineTextBlock()
    attribution = InlineTextBlock(required=False)

    class Meta:
        icon = "openquote"
        label = "Quote"
        template = "pages/blocks/quote.html"


class SpecRowBlock(blocks.StructBlock):
    label = InlineTextBlock()
    code = blocks.CharBlock(required=False)


class SpecBlock(blocks.StructBlock):
    heading = InlineTextBlock()
    rows = blocks.ListBlock(SpecRowBlock())
    meta = blocks.CharBlock(required=False)

    class Meta:
        icon = "list-ul"
        label = "Spec"
        template = "pages/blocks/spec.html"


class BannerBlock(blocks.StructBlock):
    text = blocks.RichTextBlock(features=RICH_TEXT)
    cta = CTABlock()

    class Meta:
        icon = "warning"
        label = "Banner"
        template = "pages/blocks/banner.html"


class StatementBlock(blocks.RichTextBlock):
    def __init__(self, **kwargs):
        super().__init__(features=RICH_TEXT, **kwargs)

    class Meta:
        icon = "pilcrow"
        label = "Statement"


class ContactFormBlock(blocks.StructBlock):
    prompt = InlineTextBlock(required=False, default="What's on your mind?")

    class Meta:
        icon = "mail"
        label = "Contact form"
        template = "pages/blocks/contact_form.html"


class PostscriptBlock(blocks.StructBlock):
    label = InlineTextBlock(help_text="Button text, e.g. '* Chaos dumplings?'")
    text = blocks.RichTextBlock(features=RICH_TEXT)

    class Meta:
        icon = "help"
        label = "Postscript"
        template = "pages/blocks/postscript.html"


class DialogBlock(blocks.StreamBlock):
    statement = StatementBlock()
    contact_form = ContactFormBlock()
    postscript = PostscriptBlock()

    class Meta:
        icon = "comment"
        label = "Dialog"
        template = "pages/blocks/dialog.html"
        block_counts = {"contact_form": {"max_num": 1}}


class BodyBlock(blocks.StreamBlock):
    divider = DividerBlock()
    card = CardBlock()
    photo = PhotoBlock()
    quote = QuoteBlock()
    spec = SpecBlock()
    banner = BannerBlock()
    dialog = DialogBlock()
