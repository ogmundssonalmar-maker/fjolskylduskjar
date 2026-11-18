# Codex verkefnislýsing — heimilisskjár

Notaðu `index.html` sem núverandi, virka v2 frumgerð. Ekki endurskrifa í React án þess að sýna raunverulegan ávinning; halda þessu einföldu til að byrja með.

## Markmið
Heimilisskjár á íslensku fyrir tvo fullorðna og tvö börn. Aðalskjár á að sýna í dag, þarf að muna, fram undan og kvöldmat; ekki klukkutímadagatal. Undirsíður: vikudagatal, matseðill/uppskriftir/innkaupalisti, leikskóladagatal, ferðir, verkefnalisti.

## Núverandi staða
Staðbundin static HTML-síða. Hleður sýnisgögnum sem voru sett inn 17.11.2026 úr sameiginlegu fjölskyldudagatali, leikskóladagatali Marbakka 2026–2027, ferðum og uppskriftum Krónunnar. Þessi gögn verða gömul; ekki láta líta út fyrir að þau séu lifandi.

## Mjög mikilvægt: persónuvernd
- Repository skal vera private; Cloudflare Pages umhverfi skal lokað með Cloudflare Access fyrir heimilaða fjölskyldumeðlimi, þ.m.t. preview/slóðir.
- Ekki setja raungögn eða OAuth secrets í public HTML. Áður en gögnum verður breytt úr API þarf authentication og authorization.
- Farðu yfir að deildar heimilisupplýsingar frá personal Gmail séu aðeins birtar með samþykki réttra aðila.

## Næstu verkþættir í röð
1. Halda v2 útliti, yfirfara farsíma/10–13 tommu spjaldtölvu og stóran eldhússkjá. Uppfæra aðeins mikilvægt efni.
2. Bæta við Cloudflare Access og tryggja private repository. Skrá deployment leiðbeiningar og smoke tests.
3. Tengja sameiginlegt Google-dagatal í gegnum backend OAuth (minnsta réttindasvið, read-only fyrst); styðja sjálfvirka lesuppfærslu og stilla hvaða dagatöl birtast.
4. Lesa inn Marbakka skipulagsdaga sem aðskilið dagatal eða lesaðgengilegan gagnagjafa; ekki tvískrá atburði.
5. Setja verkefni/mataseðil í Cloudflare D1 eða sambærilegan gagnagrunn með authentication svo báðir fullorðnir geti uppfært úr síma.
6. Undirbúa integration-lag fyrir Krónu: ChatGPT tenging hér er ekki staðfest sem almennt forritunar-API. Bjóða því handvirkan innflutning til að byrja með eða sannreynt API síðar.
7. Innleiða veður og aðrar áminningar með skýrum uppruna; engar tilbúnar staðfestingar.

## Acceptance criteria
- Aðalskjár sýnir í dag, þarf að muna, fram undan og kvöldmat án klukkutímagrindar.
- Áminningar byggjast á raunverulegum skráðum gögnum; frátekin stig eru merkt sem tillögur.
- Verkefni og matseðill samstillast milli heimilaðra tækja áður en því er lýst sem sameiginlegu.
- Óinnskráður notandi fær ekki aðgang að síðu eða API.
- API-lyklar og Google OAuth token aldrei út til vafra eða geymdir í git.
