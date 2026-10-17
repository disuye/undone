from wagtail.admin.panels import FieldPanel
from wagtail.fields import StreamField
from wagtail.models import Page
from wagtail.search import index

from .blocks import BodyBlock


class BasePage(Page):
    """Shared page: masthead, background layers and footer come from base.html."""

    body = StreamField(BodyBlock(), blank=True)

    content_panels = Page.content_panels + [FieldPanel("body")]
    search_fields = Page.search_fields + [index.SearchField("body")]

    class Meta:
        abstract = True


class HomePage(BasePage):
    """Site root; the only page type that shows the splash frame."""

    max_count = 1
    parent_page_types = ["wagtailcore.Page"]


class ContentPage(BasePage):
    parent_page_types = ["pages.HomePage", "pages.ContentPage"]
