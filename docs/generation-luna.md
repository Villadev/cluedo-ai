# Generació coherent amb Luna

El backend utilitza `gpt-6-luna` per defecte. Una variable `OPENAI_MODEL` del servidor té prioritat: cal actualitzar-la explícitament abans del desplegament. La subscripció de ChatGPT no configura el model ni les credencials del backend.

## Flux

1. El backend fixa culpable, víctima externa, arma, lloc i finestra del crim.
2. La IA prepara totes les professions i motius, i una xarxa de relacions que cobreix tots els participants.
3. Una única planificació global fixa secrets, rumors, coneixement privat i coartades. Es validen identitats, horaris i compatibilitat dels testimonis.
4. Les fitxes es redacten en lots de quatre amb dos lots concurrents. Només es generen descripció i personalitat; els fets fixats es conserven.
5. Es generen introducció i solució, i després pistes per ronda, amb el pla complet i les pistes anteriors com a context. El backend selecciona els fets i quan es revelen (declaracions, motius, arma, escena i traça final); el model només en redacta el text i ha de retornar tots els identificadors autoritzats.
6. Una auditoria semàntica amb Luna comprova contradiccions, filtracions i deduïbilitat. Si hi ha errors, es regeneren les fases afectades una vegada; si persisteixen, la partida no s'obre als jugadors.

Totes les respostes de generació utilitzen esquemes JSON estrictes. Les comprovacions del backend continuen sent necessàries: un esquema correcte no demostra coherència narrativa i l'auditoria d'un model tampoc és una garantia absoluta.

## Recuperació

Els passos completats es desen al JSON privat de la partida, inclosa cada ronda i cada lot. Tornar a iniciar després d'una fallada reprèn els passos pendents. També es pot reprendre una generació interrompuda per un reinici del servidor. Canviar participants, dificultat, rondes, model, mida del lot o pressupostos invalida el punt de recuperació. Reiniciar o eliminar una partida cancel·la la generació activa.

El format públic de la partida es conserva; els punts de recuperació només són interns i al depurador del mestre. No s'ha d'exposar el depurador a jugadors.

## Configuració i cost

Vegeu `apps/backend/.env.example`. El pressupost del pla creix amb el nombre de participants; fitxes i pistes tenen pressupostos separats. Una resposta truncada es reintenta amb un pressupost màxim de dues vegades l'inicial. Hi ha com a màxim tres intents per fase i una reparació global; l'SDK no afegeix reintents ocults. Els errors d'autenticació/configuració no es reintenten.

La telemetria suma només peticions reals al model, sense duplicar les mesures de l'orquestrador. El consum inclou intents fallits quan l'API retorna usage. Si una petició falla sense usage, el consum real d'aquella petició no es pot determinar des del client.

## Validació

Des de `apps/backend`:

```sh
npm install --workspaces=false --ignore-scripts --package-lock=false
npm run typecheck
npm test
npm run build
```

Les proves automàtiques substitueixen el transport d'OpenAI i imposen credencials fictícies. Verifiquen generacions amb 3, 8, 12 i 15 participants, contractes estrictes, recuperació, reparació, cancel·lació, truncament i Swagger. No mesuren la qualitat real del model.

### Prova real abans de desplegar

Amb `OPENAI_API_KEY` configurada en un entorn segur, executar explícitament:

```sh
BENCHMARK_PLAYERS=3,8,12,15 BENCHMARK_RUNS=3 npm run test:live
```

Aquesta ordre consumeix API i executa el mateix orquestrador amb emmagatzematge de prova a memòria, sense tocar les partides del servidor. Informa d'èxit, durada, intents i tokens per partida. Per estimar cost, establiu `BENCHMARK_INPUT_USD_PER_MILLION` i `BENCHMARK_OUTPUT_USD_PER_MILLION` amb les tarifes vigents; l'estimació tracta tota l'entrada com a no emmagatzemada en memòria cau.

Comparar amb el model anterior és possible executant la mateixa prova amb `OPENAI_MODEL=gpt-4o-mini`; això compara models sobre el flux nou, no equival a mesurar el flux antic.

Abans de fusionar: comprovar accés real a Luna, revisar manualment casos de 15 jugadors, confirmar que es poden deduir els tres elements i registrar temps i cost observats. Les proves amb dades simulades no substitueixen aquesta validació. El desplegament i la fusió són passos separats de la PR.
