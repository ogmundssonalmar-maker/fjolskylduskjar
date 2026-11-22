# Heima hjá okkur

Íslenskur fjölskylduskjár sem byggir á v2 frumgerðinni. HTML, CSS og JavaScript sjá um viðmótið. Cloudflare Worker sannreynir aðgang að sameiginlegum gögnum og geymir þau í D1. Pages Functions geta notað Cloudflare Access.

## Staðbundin þróun

Keyrið `npm ci` og `npm test` með Node.js 22 eða nýrra. `npm run build` býr til `dist/`. Notið `wrangler dev` með staðbundnu D1 til að prófa samstillingu og samþykkt. Sé `index.html` opnuð beint vistast verkefni og matseðilsdrög í vafranum.

Skjárinn sýnir vistaða dagskrá úr v2 á meðan Google Calendar er ótengt. Hann sýnir einnig ferðirnar og staðfestan skipulagsdag 4. janúar. Dagsetningar Marbakka 2026–2027 koma úr [skóladagatali Marbakka](https://marbakki.kopavogur.is/foreldrar/leikskoladagatal/) og [stafrænu dagatali Kópavogsbæjar](https://www.kopavogur.is/thjonusta/born-og-ungmenni/stafraen-skoladagatol).

## Cloudflare Pages

Fyrir staðbundna Pages-keyrslu notið `wrangler pages dev --config wrangler.pages.toml`. Sjálfgefna `wrangler.toml` er fyrir Workers.

1. GitHub-geymslan má vera opin á meðan unnið er með kóðann. Eldri v2 gögn eru í núverandi Git-sögu. Geymið ný fjölskyldugögn í vernduðum gagnagrunni og leyndarmál í Cloudflare-stillingum.
2. Tengið geymsluna við Cloudflare Pages með `main` sem production-grein, `npm run build` sem byggingarskipun og `dist` sem úttaksmöppu. Veljið Node.js 22 eða nýrra. Haldið sjálfvirkum preview-útgáfum óvirkum þar til Access-reglur fyrir þær eru tilbúnar.
3. Setjið upp Cloudflare Access fyrir production og öll notuð sérlén. Virkið Access fyrir preview í Pages og yfirfarið að bæði greinavísar og útgáfuslóðir falli undir regluna. Leyfið aðeins netföng foreldranna. Ef Access nær ekki yfir tiltekið hýsingarheiti þarf Functions-vörnin áfram að skila 403 þar.
4. Stillið eftirfarandi breytur í Pages Functions fyrir hvort umhverfi. Notið eingöngu AUD-gildi Access-forrita sem eiga við um það umhverfi. Geymið netföngin í Cloudflare-stillingum.

   | Breyta | Gildi |
   | --- | --- |
   | `ACCESS_TEAM_DOMAIN` | Access team-lén, t.d. `example.cloudflareaccess.com` |
   | `ACCESS_AUDIENCES` | AUD-gildi Access-forrita, aðskilin með kommum ef fleiri en eitt |
   | `ACCESS_PARENT_EMAILS` | Heimiluð netföng, aðskilin með kommum |

5. Stillið Pages Functions á **Fail closed** svo beiðnum sé hafnað ef keyrslukvóti klárast. Endurútgefið eftir breytingar á stillingum.

## Staðfesting fyrir innflutning fjölskyldugagna

- Úr óinnskráðum vafra skulu `/`, `/index.html` og `/api/test` skila Access-innskráningu eða aðgangsbanni. Prófið production, upprunalegt `pages.dev` heiti, tengd sérlén og allar virkar preview-slóðir. Athugið að Access-auðkenning er einnig virk fyrir eldri útgáfur eða fjarlægið þær áður en raunveruleg gögn eru flutt inn.
- Prófið að hvort foreldri komist inn og að utanaðkomandi netfang fái synjun.
- Athugið `Cache-Control: private, no-store` á vernduðu síðunni og að niðurstaðan á `dist` innihaldi aðeins `index.html` og `_routes.json`. Rót Git-geymslunnar er ekki birtingarmappa.

## Samstilling á Worker-útgáfunni

1. Stofnið D1 og bætið `[[d1_databases]]` með `binding = "DB"`, `database_name` og `database_id` við `wrangler.toml` eða tengið gagnagrunninn í Cloudflare. Keyrið `wrangler d1 migrations apply DB --remote` þegar D1-tengingin liggur fyrir.
2. Til að virkja samstillingu skal setja `HOUSEHOLD_EDIT_CODE` sem **Secret** undir **Runtime variables and secrets → Production**. Nánari lýsing er undir **Breytingakóði á Worker** hér að neðan.
3. Byggið með `npm ci && npm run build` og birtið með `wrangler deploy`. Ef birting fer fram í gegnum Git, stillið byggingar- og birtingarskipanirnar þar og veljið greinina með Worker-kóðanum sem production-grein. Cloudflare keyrir `wrangler preview` fyrir forskoðunargreinar og `wrangler deploy` fyrir aðalútgáfu.
4. Veljið hvaða tæki á að leggja til upphafsgögnin. Fyrsta vistanlega breytingin á því tæki fyllir tóman gagnagrunn með verkefnum og matseðli tækisins. Staðbundin gögn geymast áfram í upprunalega vafranum. Skjárinn athugar breytingar á 15 sekúndna fresti.

### Google Calendar

- Virkið Google Calendar API í Google Cloud fyrir OAuth-forritið. Búið til OAuth-vefforrit með staðfestu samþykkisferli og notið `https://www.googleapis.com/auth/calendar.events.readonly`. Tengda Google-auðkennið þarf að hafa lesaðgang að völdum dagatölum.
- Fáið refresh token með eigin OAuth-auðkenni og offline access, til dæmis í Google OAuth Playground með eigin OAuth-stillingum og skráðri redirect-slóð `https://developers.google.com/oauthplayground`. Refresh token fyrir ytri OAuth-forrit í Testing getur runnið út eftir sjö daga.
- Setjið `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` í Cloudflare Secrets. Setjið `GOOGLE_CALENDAR_IDS` í Cloudflare sem lista yfir dagatalsauðkenni aðskilin með kommum. Auðkennið fyrir Fjölskyldudagatalið er í stillingum dagatalsins undir **Integrate calendar**.
- Staðfestið að skjárinn sýni þekktan viðburð úr réttu dagatali. Yfirlitið sækir næstu 45 daga og mánaðarsýnin sækir valinn mánuð. Skjárinn athugar breytingar á fimm mínútna fresti.


## Breytingakóði á Worker

Setjið sterkan, einstakan kóða sem `HOUSEHOLD_EDIT_CODE` í **Runtime variables and secrets → Production**. Veljið **Secret**. Á hverju tæki er kóðinn sleginn inn undir **Virkja samstillingu**. Tækið fær undirritaða vafraköku sem gildir í 90 daga. Þegar kóðanum er breytt þarf að virkja tækin aftur. D1 geymir verkefni og matseðla og skráning á tæki veitir aðgang að báðu. Yfirlitið og Google-dagatalið eru aðgengileg á Worker, en samþykktur kvöldmatur birtist þeim tækjum sem hafa aðgang að fjölskyldugögnunum.

## Viðburðir skráðir í Google Calendar

Eigandi hefur samþykkt skrifaðgang fyrir Fjölskyldudagatalið. Til að virkja vistun þarf Google refresh token með heimildinni `https://www.googleapis.com/auth/calendar.events` og aðgang til að breyta Fjölskyldudagatalinu. Vista skal refresh token sem `GOOGLE_REFRESH_TOKEN` í Production. Skrifheimild heimilisskjásins er stillt í `wrangler.toml`. Ef fleiri en eitt dagatal er lesið þarf einnig að velja skrifdagatalið með `GOOGLE_CALENDAR_WRITE_ID`, sem verður að vera í `GOOGLE_CALENDAR_IDS`.

Áður en nýr viðburður er vistaður þarf að virkja samstillingu með breytingakóðanum. Viðburðurinn fer á sameiginlega dagatalið. Litaflokkurinn er vistaður með viðburðinum svo hann skili sér í mánaðarsýninni og í Google Calendar.

## Vikumatseðill og innkaupalisti

Hver vika hefst á mánudegi og hefur eina færslu í `household_menu_weeks` í D1. Færslan geymir drögin, síðustu samþykktu útgáfu, samþykktartíma og innkaupalistann. Máltíð geymir heiti, tíma, hráefni og valfrjálsa uppskriftaslóð, heiti uppskriftar, skammta og leiðbeiningar. Sérstök D1-mígrun er óþörf fyrir nýju reitina. Eldri samþykktir listar varðveitast. Þegar drög höfðu breyst frá samþykki eru heiti og hráefni samþykktrar útgáfu lesin úr eldri innkaupalistanum.

- **Matseðill** sýnir drög sem má breyta. **Samþykkja matseðil** birtir útgáfuna á yfirlitinu og útbýr innkaupalista. Við síðari breytingar haldast síðasti samþykkti matseðillinn og listinn í gildi þar til drögin eru samþykkt.
- **Innkaupin** geyma magn og einingu ef þau eru þekkt. Veljið **Verð** á vörulínu til að skrá heildarverð vörunnar fyrir skráð magn í ISK og merkja það **Áætlað** eða **Staðfest**. Auður verðreitur merkir óþekkt verð. Verð fyrir breytt magn þarf að skrá aftur. Samantekt sýnir staðfest verð, áætluð verð og fjölda vara án verðs.
- Skrá má hráefni í **Breyta máltíð**, eitt í hverri línu. Fyrir máltíð með Krónuuppskrift og auðan hráefnalista sækir Workerinn hráefni við samþykki og miðar við fjóra þegar skammtastærð er þekkt. Viðbótarvörur og verð eru skráð handvirkt í innkaupalistann.

API slóðin er `/api/household/menu?week=YYYY-MM-DD`. `GET` skilar drögum, samþykktri útgáfu, innkaupalista og útgáfunúmeri. `PUT` vistar máltíðir eða aðgerð á innkaupalista. `shoppingAction.type = "approve"` samþykkir drögin. `POST` flytur gögn inn sem drög með `{ "version": 0, "data": { ... } }` þar sem `version` á að koma úr nýjasta lestri. Vistun krefst sama uppruna, JSON og gilds útgáfunúmers. Báðar aðferðir nota núverandi aðgangsstýringu og skila `409` ef önnur vistun varð á undan. Svör með matseðilsgögnum eru merkt `private, no-store`.

### Flytja inn JSON úr ChatGPT

Veljið rétta viku undir **Matseðill → Flytja inn JSON**, límið gögnin inn og veljið **Vista sem drög**. Ein til sjö máltíðir eru leyfðar. Hver máltíð þarf `date` í valinni viku og `name`. Aðrir reitir eru valfrjálsir. Vistunin uppfærir dagana sem koma fram í JSON. Skráðir dagar utan innflutnings varðveitast. Yfirfarið drögin og samþykkið þegar þau eru tilbúin.

```json
{
  "week": "2026-11-23",
  "meals": [
    {
      "date": "2026-11-23",
      "name": "Tómatsúpa",
      "minutes": 30,
      "ingredients": ["500 g tómatar", "1 stk. laukur"],
      "recipe": {
        "title": "Tómatsúpa fyrir fjóra",
        "servings": 4,
        "instructions": "Mýkið laukinn. Bætið tómötum við, látið malla og maukið."
      }
    }
  ]
}
```

### Vikuleg drög með OpenAI og Cron

Workerinn er með `scheduled`-meðhöndlun. Hún notar Responses API og biður um matseðil fyrir fjóra sem byrjar á mánudegi næstu viku. Áður en drög eru vistuð þarf hver eldaður réttur að hafa hráefni, fjóra skammta og tvö til þrjú eldunarskref. Afgangadagur og frjáls dagur eru valfrjálsir. D1 leyfir að hámarki eina sjálfvirka API-beiðni fyrir hverja viku og beiðnin takmarkast við 3.500 úttakstóka. Keyrslan fyllir tóma viku með drögum sem þarf að samþykkja í viðmótinu.

Keyrslan á aðalútgáfunni er stillt á sunnudaga kl. 17:00 að íslenskum tíma og notar `gpt-5.4-mini`. `wrangler.toml` geymir tímasetninguna, `OPENAI_MENU_MODEL` og `WEEKLY_MENU_AUTOMATION_ENABLED`. `OPENAI_API_KEY` er Cloudflare Secret í **Runtime variables and secrets → Production**. Yfirfarið API-verð og prófið JSON-úttak þegar skipt er um líkan eða lykil.

OpenAI semur uppskriftirnar í venjulegri keyrslu. Ef beiðnin mistekst eða leiðbeiningar vantar setur Workerinn saman varamatseðil með vistuðum hráefnalistum, eldunarskrefum og tenglum á Krónuuppskriftir. Sjálfvirka tilraunin er bókuð fyrir vikuna til að forðast endurteknar gjaldfærslur. Til að gera keyrsluna óvirka skal stilla `WEEKLY_MENU_AUTOMATION_ENABLED` á `false`, setja `crons = []` undir `[triggers]` og gefa Workerinn aftur út.

### Microsoft To Do

Skráið vefumsókn í Microsoft Entra App registrations fyrir bæði Microsoft-vinnu- og persónulega reikninga og bætið við Web redirect URI `https://fjolskylduskjar.ogmundssonalmar.workers.dev/api/todo/callback`. Bætið við Microsoft Graph **delegated** heimildinni `Tasks.ReadWrite`. Setjið Application (client) ID sem `MS_TODO_CLIENT_ID` og **gildi** client secret sem `MS_TODO_CLIENT_SECRET` undir **Runtime variables and secrets → Production**.

Eigandi sameiginlega listans velur **Matseðill → Tengja reikning Oddnýjar** og velur listann eftir að hafa samþykkt Microsoft-heimildina. **Senda í Microsoft To Do** setur ókeypt hráefni úr samþykkta matseðlinum á þann lista. Heimilisskjárinn merkir eigin atriði til að bera kennsl á þau þegar sent er aftur. Hakið við atriði í Microsoft To Do á innkaupum. OAuth-auðkenni geymast dulkóðuð í D1 og lykillinn er leiddur af `MS_TODO_CLIENT_SECRET`. Ef því leyndargildi er skipt út þarf að tengja Microsoft-reikninginn aftur.
