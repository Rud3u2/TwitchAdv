[README.md](https://github.com/user-attachments/files/35438657/README.md)
# TwitchAdv.user

Userscript per Twitch: blocca preroll, midroll e annunci cuciti nelle playlist HLS, toglie i banner pubblicitari dalla pagina e mantiene la qualità scelta durante i break.

Autore: **Rud3u2** · versione **2.0.7**

\---

## Cosa fa

* Intercetta le playlist HLS dentro il worker del player e sostituisce i segmenti pubblicitari con un filler locale: l'annuncio non viene scaricato né mostrato.
* Quando un break non è aggirabile, passa a una seconda sorgente (`embed` / `popout`) e preferisce quella senza tag pubblicitari.
* Nasconde banner, overlay, countdown e iframe pubblicitari, senza toccare player, chat e contenitori React.
* Conserva qualità, volume e mute tra un reload del player e l'altro.
* Recupera da solo i blocchi di buffering del player.

Non tocca l'account, non manda dati a terzi: parla solo con Twitch. Nessun permesso speciale richiesto (`@grant none`).

\---

## Requisiti

* Browser moderno: Chrome, Edge, Brave, Opera o Firefox.
* Violentmonkey (consigliato) o Tampermonkey.
* Il file `TwitchAdv.user.js` da questo repository.

uBlock Origin è opzionale: lo script copre già i banner di Twitch. Tienilo attivo solo se vuoi il blocco tracker generico.

\---

## Installazione

1. Installa un gestore di userscript:

   * Violentmonkey — https://violentmonkey.github.io/get-it/
   * Tampermonkey — https://www.tampermonkey.net/
2. Apri questo repository e clicca `TwitchAdv.user.js`.
3. Clicca **Raw**.
4. Violentmonkey mostra il prompt **Installa**: conferma.
5. Se il prompt non appare: dashboard Violentmonkey → **+** → **Installa da URL** → incolla l'URL Raw.
6. Chiudi tutte le tab di Twitch.
7. Riapri Twitch e fai un hard refresh con **Ctrl+Shift+R**.

Nel pannello del gestore deve comparire **TwitchAdv.user**, versione 2.0.7.

\---

## Verifica che stia lavorando

1. Apri uno stream che normalmente manda pubblicità.
2. **F12** → **Console**.
3. Guarda un break.

Righe attese:

```text
hookWorkerFetch (TwitchAdv)
Blocking ads (embed)
Blocking midroll ads (embed)
Finished blocking ads
Reloading Twitch player
```

Un flicker di qualità o un reload del player sul confine del break è il cambio sorgente che fa il suo lavoro.

Comandi utili dalla console:

```js
window.simulateAds(1)        // simula un break (0 = nessuno, 1+ = profondità)
window.allSegmentsAreAdSegments()  // tratta ogni segmento come pubblicità
window.reloadTwitchPlayer()  // forza il reload del player
```

\---

## Impostazioni

Tutte le opzioni stanno in `declareOptions()`, in cima allo script. Le più utili:

|Opzione|Default|Cosa fa|
|-|-|-|
|`IsAdStrippingEnabled`|`true`|Rimuove i segmenti pubblicitari dalla playlist|
|`ShowAdBlockBanner`|`false`|Scritta "Blocking ads" nell'angolo del player|
|`ForceAccessTokenPlayerType`|`'popout'`|Tipo di player usato per ottenere la playlist pulita|
|`BackupPlayerTypes`|`\['embed', 'popout']`|Sorgenti di riserva, in ordine di preferenza|
|`SkipPlayerReloadOnHevc`|`true`|Non degrada a AVC durante i break (2k/4k)|
|`AlwaysReloadPlayerOnAd`|`false`|Forza pausa/play a ogni ingresso e uscita dall'ad|
|`PlayerBufferingFix`|`true`|Recupero automatico dai blocchi di buffering|
|`PlayerBufferingDelay`|`600`|Ogni quanto controllare lo stato del player (ms)|
|`PlayerBufferingSameStateCount`|`5`|Tick di stallo prima di intervenire|

\---

## Problemi e soluzioni

|Problema|Causa / fix|
|-|-|
|Lo script non compare nel gestore|Installa prima Violentmonkey, poi reinstalla dal Raw|
|Console vuota|Hard refresh, chiudi altri script anti-ad, controlla che sia abilitato|
|`skipping TwitchAdv as there's another script active`|Disabilita ogni altro blocco pubblicità per Twitch|
|Gli annunci passano lo stesso|Hai aperto la pagina del file, non il Raw: reinstalla dall'URL Raw|
|Qualità che cala|Verifica la 2.0.0+ e non usare il fallback `autoplay`|
|Player error `#2000`|Chiudi la tab, riapri, hard refresh; lascia recuperare il watchdog una volta|
|Chat vuota o "Caricamento del modulo non riuscito"|Aggiorna alla 2.0.6+: le versioni precedenti nascondevano gli antenati della chat|
|Stream lento a partire|Aggiorna alla 2.0.6+: correggeva un'eccezione che bloccava la richiesta della playlist|
|Scritta "Blocking ads" fissa|Aggiorna alla 2.0.7: ora è spenta di default e ha un watchdog|
|`TwitchAdv: playlist rewrite failed` in console|Il rewrite è fallito e il player ha ricevuto la playlist originale: nessun blocco|

\---

## Changelog

**2.0.7**

* Il badge "Blocking ads" è spento di default (`ShowAdBlockBanner = false`).
* Watchdog: badge e stato di stripping si azzerano da soli se il worker smette di aggiornare.

**2.0.6**

* Chat: l'iframe `/embed/<canale>/chat` è escluso, chat/player/root non vengono mai nascosti, niente più `remove()` sui nodi React e niente più flapping degli antenati.
* Avvio: corretto `getServerTimeFromM3u8` che lanciava su playlist senza `SERVER-TIME` e lasciava la fetch appesa.
* `new Response(null, {status: 204})` al posto del body vuoto, che faceva lanciare il costruttore.
* MutationObserver coalescente a 250 ms, token in cache 60 s, usher e varianti in parallelo, rivalidazione encodings ogni 15 s.
* Watchdog del buffering più leggero: nessun walk del fiber tree prima del `<video>`.

**2.0.5** e precedenti — versione pubblica iniziale.

\---

## File

* `TwitchAdv.user.js` — lo userscript
* `README.md` — questo documento

\---

## Pubblicare il repository

Per il maintainer:

1. Crea il repository GitHub.
2. Carica `TwitchAdv.user.js` e `README.md`.
3. Commit su `main`.
4. Copia l'URL Raw di `TwitchAdv.user.js` e mettilo nei passi di installazione.
5. Aggiorna `@version` nello script a ogni modifica: è quello che fa scattare l'update nei gestori.

Forma dell'URL Raw:

```text
https://raw.githubusercontent.com/<UTENTE>/<REPO>/main/TwitchAdv.user.js
```

