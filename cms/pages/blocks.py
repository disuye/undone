"""StreamField blocks: one top-level block per `data-is` used inside <main>.

Each block renders the same markup as the static prototype (index.html), so
layout rules in style.css (nth-child of article/figure) apply unchanged.
"""

from wagtail import blocks
from wagtail.images.blocks import ImageChooserBlock

RICH_TEXT = ["brand", "highlight", "zh", "emphasis", "link"]


class CTAValue(blocks.StructValue):
    def href(self):
        page = self.get("page")
        return page.url if page else self.get("url") or "#"


class CTABlock(blocks.StructBlock):
    label = blocks.CharBlock(required=False, help_text="Leave empty for no link.")
    page = blocks.PageChooserBlock(required=False)
    url = blocks.CharBlock(required=False, help_text="External URL or #anchor; used when no page is chosen.")

    class Meta:
        value_class = CTAValue
        label = "Call to action"


class DividerBlock(blocks.StructBlock):
    heading = blocks.CharBlock()
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
    heading = blocks.CharBlock()
    standfirst = blocks.TextBlock(required=False)
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
    caption = blocks.CharBlock(required=False)

    class Meta:
        icon = "image"
        label = "Photo"
        template = "pages/blocks/photo.html"


class QuoteBlock(blocks.StructBlock):
    text = blocks.TextBlock()
    attribution = blocks.CharBlock(required=False)

    class Meta:
        icon = "openquote"
        label = "Quote"
        template = "pages/blocks/quote.html"


class SpecRowBlock(blocks.StructBlock):
    label = blocks.CharBlock()
    code = blocks.CharBlock(required=False)


class SpecBlock(blocks.StructBlock):
    heading = blocks.CharBlock()
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
    prompt = blocks.CharBlock(required=False, default="What's on your mind?")

    class Meta:
        icon = "mail"
        label = "Contact form"
        template = "pages/blocks/contact_form.html"


class PostscriptBlock(blocks.StructBlock):
    label = blocks.CharBlock(help_text="Button text, e.g. '* Chaos dumplings?'")
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
