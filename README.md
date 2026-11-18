# Heima hjá okkur

Íslenskur fjölskylduskjár sem byggir á v2 frumgerðinni. HTML, CSS og JavaScript sjá um viðmótið. Cloudflare Pages Functions sannreyna innskráningu á netþjóni.

## Staðbundin þróun

Keyrið `npm ci` og `npm test` með Node.js 22 eða nýrra. `npm run build` býr til `dist/`. Til að skoða viðmótið staðbundið má opna `index.html` beint. Verkefni og breytingar á dæmimatseðli vistast í viðkomandi vafra. Sameiginleg vistun, lifandi dagatal og veður bíða síðari áfanga.

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

Setjið sterkan, einstakan kóða sem `HOUSEHOLD_EDIT_CODE` í **Runtime variables and secrets → Production**. Veljið **Secret**. Á hverju tæki er kóðinn sleginn inn undir **Virkja samstillingu**. Tækið fær undirritaða vafraköku sem gildir í 90 daga. Þegar kóðanum er breytt þarf að virkja tækin aftur. D1 geymir verkefni og matseðla og skráning á tæki veitir aðgang að báðu. Opna yfirlitið og Google-dagatalið krefjast ekki kóðans.

## Viðburðir skráðir í Google Calendar

Eigandi hefur samþykkt skrifaðgang fyrir Fjölskyldudagatalið. Til að virkja vistun þarf Google refresh token með heimildinni `https://www.googleapis.com/auth/calendar.events` og aðgang til að breyta Fjölskyldudagatalinu. Vista skal refresh token sem `GOOGLE_REFRESH_TOKEN` í Production. Skrifheimild heimilisskjásins er stillt í `wrangler.toml`. Ef fleiri en eitt dagatal er lesið þarf einnig að velja skrifdagatalið með `GOOGLE_CALENDAR_WRITE_ID`, sem verður að vera í `GOOGLE_CALENDAR_IDS`.

Áður en nýr viðburður er vistaður þarf að virkja samstillingu með breytingakóðanum. Viðburðurinn fer á sameiginlega dagatalið. Litaflokkurinn er vistaður með viðburðinum svo hann skili sér í mánaðarsýninni og í Google Calendar.

## Innkaupalisti

Samþykki matseðils býr til sameiginlegan innkaupalista. Skrá má hráefni í **Breyta máltíð**, eitt í hverri línu. Fyrir máltíðir með Krónuuppskrift og auðan hráefnalista les Workerinn hráefnin úr [opinberri lestrartengingu Krónunnar](https://www.kronan.is/frettir/voruurval-kronunnar-adgengilegt-i-claude) og miðar magnið við fjóra þegar skammtastærð er tiltæk. Ef þjónustan svarar ekki notar skjárinn vistaða hráefnalista fyrir Krónuréttina sem fylgja dæmimatseðlinum. Samþykkti listinn og hak við keypt atriði geymast með matseðlinum í D1. Breytingar á drögum taka gildi á listanum við næsta samþykki.
