# Birting fjölskylduskjás í Cloudflare Pages

1. Veljið **Workers & Pages → Create application → Pages → Upload assets**. Notið nýtt Pages-verkefni, til dæmis `fjolskylduskjar-pages`.
2. Hlaðið `FJOLSKYLDUSKJAR-CLOUDFLARE.zip` upp beint og veljið **Deploy**. ZIP-pakkinn inniheldur bakendann í `_worker.js`.
3. Undir **Settings → Variables and Secrets → Production** skal setja `APP_PASSWORD` sem **Secret**. Veljið sterkt, einstakt lykilorð. Notandanafnið er `heimili`. Fram að uppsetningu lykilorðs lokar bakendinn fyrir síðuna og API.
4. Undir **Bindings** veljið **D1 database**, heitið bindinguna `DB` og veljið fyrirliggjandi grunn `fjolskylduskjar-db`. Ef taflan `household` er óstofnuð, keyrið SQL-skipunina í `migrations/0001_household.sql` í D1 Console.
5. Færið fyrirliggjandi `GOOGLE_CALENDAR_IDS` inn sem **Text** og `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` og `GOOGLE_REFRESH_TOKEN` inn sem **Secret**. Setjið gildin undir **Production**. Google-heimildin sjálf geymist hjá Google og gildir áfram svo framarlega sem refresh token er virkt.
6. Búið til nýja production-birtingu með sama ZIP ef stillingarnar tóku ekki gildi strax. Opnið nýju Pages-slóðina, skráið ykkur inn og staðfestið að vistaða dagskráin og ferðirnar birtist. Prófið svo einn þekktan viðburð úr Google Calendar og vistun verkefnis.

## Smíða ZIP

Keyrið `npm ci`, `npm test` og `npm run build:pages`. Setjið `index.html` og `_worker.js` úr `dist` í rót ZIP-skrárinnar.

Til að prófa pakkann með Wrangler Pages Dev skal keyra `wrangler pages dev <slóð-að-afritaðri-dist-möppu>` úr annarri möppu en Worker-geymslunni og stilla `APP_PASSWORD` fyrir prófið.
