import re

from django import template
from django.utils.safestring import mark_safe

register = template.Library()

BLOCK_KEY = re.compile(r'\sdata-block-key="[^"]*"')


@register.filter
def strip_block_keys(html):
    """Drop Wagtail's editor-only paragraph keys from public rich text."""
    return mark_safe(BLOCK_KEY.sub("", str(html)))
