# Heima hjá okkur

Íslenskur fjölskylduskjár sem byggir á v2 frumgerðinni. HTML, CSS og JavaScript sjá um viðmótið. Cloudflare Pages Functions sannreyna innskráningu á netþjóni.

## Staðbundin þróun

Keyrið `npm ci` og `npm test` með Node.js 22 eða nýrra. `npm run build` býr til `dist/`. Til að skoða viðmótið staðbundið má opna `index.html` beint. Verkefni og breytingar á dæmimatseðli vistast í viðkomandi vafra. Sameiginleg vistun, lifandi dagatal og veður bíða síðari áfanga.

Hýsingarútgáfan hefur auða dagskrá, ferðir, leikskóla og upphafsverkefni. Hún inniheldur dæmimatseðil. V2 gögnin eru í fyrri útgáfu og eiga heima í vernduðum gagnagrunni þegar aðgangsstýring hefur verið staðfest. Berið leikskóladagsetningar undir PDF-heimildina fyrir innflutning.

## Cloudflare Pages

1. Staðfestið að GitHub-geymslan sé **Private** áður en hýsing er tengd. V2 gögn eru í Git-sögunni.
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
