import re
from html import unescape

from wagtail.embeds.embeds import get_embed

IFRAME_SRC = re.compile(r'<iframe\b[^>]*\ssrc="([^"]+)"')


def frame_for(url):
    """The provider's iframe src (privacy-enhanced where offered) and title; None if it isn't an iframe player."""
    embed = get_embed(url)
    match = IFRAME_SRC.search(embed.html)
    if not match:
        return None
    src = unescape(match.group(1)).replace("www.youtube.com/embed/", "www.youtube-nocookie.com/embed/")
    if "player.vimeo.com" in src:
        src += ("&" if "?" in src else "?") + "dnt=1"
    return {"src": src, "title": embed.title}
