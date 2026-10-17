from django.db import migrations


def create_homepage(apps, schema_editor):
    ContentType = apps.get_model("contenttypes.ContentType")
    Page = apps.get_model("wagtailcore.Page")
    Site = apps.get_model("wagtailcore.Site")
    HomePage = apps.get_model("pages.HomePage")

    # Replace Wagtail's default "Welcome" page (and its Site) with a HomePage.
    Locale = apps.get_model("wagtailcore.Locale")
    default_type = ContentType.objects.get(model="page", app_label="wagtailcore")
    defaults = Page.objects.filter(content_type=default_type, slug="home", depth=2)
    locale = defaults.first().locale if defaults.exists() else Locale.objects.first()
    defaults.delete()

    home_type, _ = ContentType.objects.get_or_create(model="homepage", app_label="pages")
    home = HomePage.objects.create(
        title="Undone Limited",
        draft_title="Undone Limited",
        slug="home",
        content_type=home_type,
        path="00010001",
        depth=2,
        numchild=0,
        url_path="/home/",
        locale=locale,
    )
    Site.objects.create(hostname="localhost", root_page=home, is_default_site=True)


def remove_homepage(apps, schema_editor):
    ContentType = apps.get_model("contenttypes.ContentType")
    HomePage = apps.get_model("pages.HomePage")
    HomePage.objects.filter(slug="home", depth=2).delete()
    ContentType.objects.filter(model="homepage", app_label="pages").delete()


class Migration(migrations.Migration):
    dependencies = [("pages", "0001_initial")]

    operations = [migrations.RunPython(create_homepage, remove_homepage)]
