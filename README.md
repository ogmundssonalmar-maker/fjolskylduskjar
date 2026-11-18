# Heima hjá okkur — frumgerð v2

Ein einföld HTML/CSS/JavaScript-síða fyrir fjölskylduyfirlit. Engin npm-uppsetning eða build-skref nauðsynlegt.

## Athugið: einkagögn og öryggi

`index.html` inniheldur persónulegar upplýsingar um dagskrá, leikskóla, ferðir og fjölskyldu. **Ekki setja í opinbert GitHub-repository og ekki birta á opinni Cloudflare Pages-slóð.** `robots=noindex` er **ekki** aðgangsstýring.

1. Notið **private GitHub repository**.
2. Setjið **Cloudflare Access** fyrir allt Pages-svæðið (OTP innskráning heimiluð aðeins til aðilanna sem eiga að sjá síðuna) **áður** en slóð er deilt. Staðfestið með óinnskráðum vafra að aðgangur sé lokaður. Farið yfir hvort preview-slóðir og sérlén séu einnig varin.
3. Ef ekki er hægt að tryggja aðgangsstýringu, fjarlægið öll raunveruleg fjölskyldugögn úr skránni og notið aðeins sýnidæmi.
4. Aldrei vista Google OAuth client secrets eða önnur lykilorð í HTML/JavaScript eða GitHub. Fyrir lifandi samstillingu þarf server-side OAuth/API og örugga vöktun heimilda.

## Cloudflare Pages úr GitHub

- Create application > Pages > Connect to Git > veljið private repo.
- Production branch: `main`.
- Framework preset: None.
- Build command: autt eða `exit 0`.
- Build output directory: `.` (repository-root, inniheldur `index.html`).
- Setjið Cloudflare Access reglur áður en persónuleg vefslóð er tekin í notkun.
- Eftir git push á `main` uppfærist síðan sjálfkrafa samkvæmt Git samþættingu Pages.

## Það sem virkar í þessari útgáfu

- Dagssýn án klukkutíma-töflu; sýnir aðeins raunverulega skráða viðburði.
- Áminningar vegna Kanaríferðar, leikskóladaga og skíðaferðar.
- 7 daga vikuyfirlit, matseðill með Krónu-uppskriftatenglum.
- Verkefni sem hægt er að haka við / bæta við / eyða, og breyta matseðli.
- Staðbundin `localStorage` geymsla á hverju tæki. **Ekki samstilling milli tækja.**

## Ekki komið

- Lifandi Google Calendar samstilling og uppfærsla.
- Sameiginlegur verkefnalisti milli síma og skjás.
- Krónu-innkaupakarfa / vöruverð í rauntíma.
- Veður, persónusnið, innskráning og Cloudflare Access uppsetning.

## Næsti fasi í Codex

1. Lesið `CODEX_BRIEF.md`.
2. Bætið við innskráningu, server-side Google Calendar lesaðgangi, öruggum gagnagrunni fyrir verkefni og matseðil.
3. Hafið OAuth secrets eingöngu á netþjóni (Cloudflare Pages Functions eða Worker), ekki í vafra.
4. Sjálfvirkt vikumatseðilsgjald/krónu-uppskriftir síðar; ekki gera ráð fyrir að Krónu-ChatGPT-tengingin sé almennt API.
