import re

from django import template
from django.utils.safestring import mark_safe

from pages.embeds import frame_for

register = template.Library()

BLOCK_KEY = re.compile(r'\sdata-block-key="[^"]*"')


@register.filter
def strip_block_keys(html):
    """Drop Wagtail's editor-only paragraph keys from public rich text."""
    return mark_safe(BLOCK_KEY.sub("", str(html)))


@register.simple_tag
def embed_frame(url):
    """iframe src and title for an embed URL, so templates own the <iframe> markup."""
    return frame_for(url)
