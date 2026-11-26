// ==UserScript==
// @name         TwitchAdv.user
// @namespace    https://rud3u2.local
// @version      2.0.7
// @description  Twitch HLS ad stripper and cleanup.
// @author       Rud3u2
// @match        *://*.twitch.tv/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    // Twitch serves chat in its own /embed/<channel>/chat frame. The video ad
    // hooks have nothing to do in there and only risk breaking the chat module
    // boot ("Failed to load module"), so that frame is left completely alone.
    const isChatFrame = window.self !== window.top
        && /\/embed\//.test(location.pathname)
        && /chat/i.test(location.pathname);
    if (isChatFrame) {
        return;
    }

    const AD_SELECTORS = [
        '[data-a-target="ad-banner-container"]',
        '[data-a-target="ad-banner"]',
        '[data-a-target="display-ad"]',
        '[data-a-target="advertisement"]',
        '[data-a-target="video-ad-banner"]',
        '[data-a-target="video-ad-countdown"]',
        '[data-a-target="video-ad-countdown-container"]',
        '[data-a-target="video-ad-label"]',
        '[data-a-target="stream-display-ad"]',
        '[data-a-target="ax-overlay"]',
        '[data-test-selector="sad-overlay"]',
        '[data-test-selector="ad-banner-default-text"]',
        '[data-test-selector="ad-banner-default-text-container"]',
        '[data-ad="true"]',
        'button[aria-label*="Learn more about this ad" i]',
        '.ad-container',
        '.ad-slot',
        '.tw-ad-container',
        '.player-advert',
        '.player-ad-notice',
        '.display-ad',
        '.ad-banner',
        '.ad-overlay',
        '.ads-container',
        '.video-player__ad-container',
        '.persistent-player__ad-banner',
        '.pbyp-player-instance',
        '.picture-by-picture-player--collapsed',
        '[class*="AdContainer"]',
        '[class*="AdBanner"]',
        '[class*="DisplayAd"]',
        '[class*="ad-container"]',
        '[class*="ad-banner"]',
        '[aria-label*="advertisement" i]',
        '[aria-label*="sponsored" i]',
        'iframe[src*="amazon-adsystem"]',
        'iframe[src*="doubleclick"]',
        'iframe[src*="googlesyndication"]',
        'iframe[src*="imasdk"]'
    ].join(',');

    const AD_UI_SEEDS = [
        '[data-a-target="video-ad-countdown"]',
        '[data-a-target="video-ad-countdown-container"]',
        '[data-a-target="video-ad-label"]',
        '[data-a-target="stream-display-ad"]',
        '[data-a-target="ax-overlay"]',
        '[data-test-selector="sad-overlay"]',
        '[data-test-selector="ad-banner-default-text"]',
        '[data-test-selector="ad-banner-default-text-container"]',
        '.player-ad-notice',
        'button[aria-label*="Learn more about this ad" i]'
    ].join(',');

    function hasPlayerControls(node) {
        return !!(node && node.querySelector && node.querySelector('[data-a-target="player-controls"], .player-controls'));
    }

    // Chat, player and page roots are never hidden: Twitch mounts the chat
    // module lazily and a hidden or flapping ancestor makes it fail to load.
    const CHAT_PROTECT = [
        '[data-test-selector="chat-room-component-layout"]',
        '[data-a-target="chat-room-component-layout"]',
        '[data-test-selector="chat-room-component"]',
        '#chat-room-component',
        '.chat-shell',
        '[class*="chat-shell"]',
        '[class*="chat-room"]',
        '[class*="chat-input"]',
        '[class*="chat-scrollable"]'
    ].join(',');

    const AD_WORD = /(^|[\s_-])(ads?|advert\w*|sponsor\w*|promo\w*)([\s_-]|$)/i;
    const AD_CLASS = /(AdContainer|AdBanner|DisplayAd|ad-container|ad-banner|ad-overlay|ad-slot)/;

    function isProtectedNode(node) {
        if (!node || node.nodeType !== 1) {
            return true;
        }
        if (node === document.body || node === document.documentElement || node.id === 'root') {
            return true;
        }
        if (node.querySelector && (node.querySelector('video') || node.querySelector(CHAT_PROTECT))) {
            return true;
        }
        return !!(node.closest && node.closest(CHAT_PROTECT));
    }

    function looksLikeAdShell(node, child) {
        if (!node || node.nodeType !== 1 || isProtectedNode(node) || hasPlayerControls(node)) {
            return false;
        }
        if (node.matches && node.matches('.video-player, [data-a-target="video-player"], .persistent-player, #channel-player')) {
            return false;
        }
        const className = typeof node.className === 'string' ? node.className : '';
        const adTarget = node.getAttribute('data-a-target') || '';
        if (AD_WORD.test(className) || AD_CLASS.test(className) || AD_WORD.test(adTarget) || node.hasAttribute('data-ad')) {
            return true;
        }
        // Pure wrapper: nothing in it but the ad node the walk started from.
        return node.children.length === 1 && node.firstElementChild === child;
    }

    const hiddenAdShells = new Set();

    function hideNode(node) {
        if (!node || node.nodeType !== 1 || isProtectedNode(node)) {
            return;
        }
        node.style.setProperty('display', 'none', 'important');
        hiddenAdShells.add(node);
    }

    function hideAdUiShells() {
        // Nodes are never re-shown: the stylesheet already hides the ad itself,
        // and toggling ancestors on every mutation is what made the page crawl.
        for (const node of hiddenAdShells) {
            if (!node.isConnected) {
                hiddenAdShells.delete(node);
            }
        }
        for (const seed of document.querySelectorAll(AD_UI_SEEDS)) {
            if (isProtectedNode(seed)) {
                continue;
            }
            let child = seed;
            let node = seed.parentElement;
            for (let depth = 0; depth < 2 && node; depth++) {
                if (!looksLikeAdShell(node, child)) {
                    break;
                }
                hideNode(node);
                child = node;
                node = node.parentElement;
            }
        }
        for (const rail of document.querySelectorAll('.metadata-layout_support, .metadata-layout__support, [data-test-selector="metadata-layout-support"]')) {
            if (!rail.querySelector || rail.querySelector(CHAT_PROTECT)) {
                continue;
            }
            if (rail.querySelector(AD_UI_SEEDS + ', iframe[src*="doubleclick"], iframe[src*="googlesyndication"]')) {
                hideNode(rail);
            }
        }
    }

    // Narrow Turbo promo hooks only. .player-overlay-background is a generic
    // Twitch scrim, so it is hidden only when it actually carries a Turbo link.
    const TURBO_CSS = [
        '.player-overlay-background:has(a[href*="/turbo"])',
        '.player-overlay-background:has(a[href*="/how-to-allow-ads-browser"])',
        '#channel-player-disclosures + div:has(a[href*="/turbo"])'
    ].join(',');

    function isTurboPromo(node) {
        if (!node || !node.querySelectorAll) {
            return false;
        }
        if (node.querySelector('a[href*="/turbo"], a[href*="/how-to-allow-ads-browser"]')) {
            return true;
        }
        const text = String(node.innerText || node.textContent || '');
        return /twitch turbo/i.test(text) && /(ad.free|ads?|subscribe|try turbo)/i.test(text);
    }

    function hideTurboPromos() {
        const player = document.querySelector('.video-player, [data-a-target="video-player"], #channel-player');
        const hosts = (player || document).querySelectorAll('.player-overlay-background, #channel-player-disclosures + div');
        for (const node of hosts) {
            if (isTurboPromo(node)) {
                hideNode(node);
            }
        }
    }

    try {
        const style = document.createElement('style');
        style.textContent = AD_SELECTORS + '{display:none!important;visibility:hidden!important}\n'
            + TURBO_CSS + '{display:none!important;visibility:hidden!important}';
        (document.head || document.documentElement).appendChild(style);
        const hideDomAds = function () {
            hideAdUiShells();
            hideTurboPromos();
        };
        hideDomAds();
        // Coalesce: Twitch mutates the DOM hundreds of times per second while the
        // page boots, and a full-document selector sweep on every mutation was the
        // single biggest startup cost of this script.
        let domAdPassQueued = false;
        const scheduleDomAdPass = function () {
            if (domAdPassQueued) {
                return;
            }
            domAdPassQueued = true;
            setTimeout(function () {
                domAdPassQueued = false;
                hideDomAds();
            }, 250);
        };
        new MutationObserver(scheduleDomAdPass).observe(document.documentElement, { childList: true, subtree: true });
    } catch (error) {
    }

    const ourTwitchAdSolutionsVersion = 24;// Used to prevent conflicts with outdated versions of the scripts
    if (typeof window.twitchAdSolutionsVersion !== 'undefined' && window.twitchAdSolutionsVersion >= ourTwitchAdSolutionsVersion) {
        console.log("skipping TwitchAdv as there's another script active. ourVersion:" + ourTwitchAdSolutionsVersion + " activeVersion:" + window.twitchAdSolutionsVersion);
        window.twitchAdSolutionsVersion = ourTwitchAdSolutionsVersion;
        return;
    }
    window.twitchAdSolutionsVersion = ourTwitchAdSolutionsVersion;
    function declareOptions(scope) {
        scope.AdSignifier = 'stitched';
        scope.ClientID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
        scope.BackupPlayerTypes = [
            'embed',//Source
            'popout'//Source
            //'autoplay'//360p fallback removed to preserve quality
            //'picture-by-picture-CACHED'//360p (-CACHED is an internal suffix and is removed)
        ];
        scope.FallbackPlayerType = 'embed';
        scope.ForceAccessTokenPlayerType = 'popout';
        scope.SkipPlayerReloadOnHevc = true;// Keep the selected HEVC/2k/4k rendition instead of swapping down to AVC during ad breaks (Firefox-safe; Chrome can throw #4000 / #3000 on 2k/4k)
        scope.AlwaysReloadPlayerOnAd = false;// Always pause/play when entering/leaving ads
        scope.ReloadPlayerAfterAd = false;// Resume with pause/play after an ad: no full player reload, so the stream starts faster
        scope.PlayerReloadMinimalRequestsTime = 1500;
        scope.PlayerReloadMinimalRequestsPlayerIndex = 0;//no autoplay fallback; start from embed
        scope.HasTriggeredPlayerReload = false;
        scope.StreamInfos = [];
        scope.StreamInfosByUrl = [];
        scope.GQLDeviceID = null;
        scope.ClientVersion = null;
        scope.ClientSession = null;
        scope.ClientIntegrityHeader = null;
        scope.AuthorizationHeader = undefined;
        scope.SimulatedAdsDepth = 0;
        scope.PlayerBufferingFix = true;// If true this will pause/play the player when it gets stuck buffering
        scope.PlayerBufferingDelay = 600;// How often should we check the player state (in milliseconds)
        scope.PlayerBufferingSameStateCount = 5;// How many times of seeing the same player state until we trigger pause/play (it will only trigger it one time until the player state changes again)
        scope.PlayerBufferingDangerZone = 1;// The buffering time left (in seconds) when we should ignore the players playback position in the player state check
        scope.PlayerBufferingDoPlayerReload = false;// If true this will do a player reload instead of pause/play (player reloading is better at fixing the playback issues but it takes slightly longer)
        scope.PlayerBufferingMinRepeatDelay = 8000;// Minimum delay (in milliseconds) between each pause/play (this is to avoid over pressing pause/play when there are genuine buffering problems)
        scope.PlayerBufferingPrerollCheckEnabled = false;// Enable this if you're getting an immediate pause/play/reload as you open a stream (which is causing the stream to take longer to load). One problem with this being true is that it can cause the player to get stuck in some instances requiring the user to press pause/play
        scope.PlayerBufferingPrerollCheckOffset = 5;// How far the stream need to move before doing the buffering mitigation (depends on PlayerBufferingPrerollCheckEnabled being true)
        scope.V2API = false;
        scope.IsAdStrippingEnabled = true;
        scope.ShowAdBlockBanner = false;// Overlay notice in the player corner. Off by default: cosmetic, and it used to stay on screen after the ad ended. Set true to bring it back.
        scope.AdSegmentCache = new Map();
        scope.AllSegmentsAreAdSegments = false;
    }
    let isActivelyStrippingAds = false;
    let localStorageHookFailed = false;
    const twitchWorkers = [];
    const workerStringConflicts = [
        'twitch',
        'isVariantA'// TwitchNoSub
    ];
    const workerStringAllow = [];
    const workerStringReinsert = [
        'isVariantA',// TwitchNoSub (prior to (0.9))
        'besuper/',// TwitchNoSub (0.9)
        '${patch_url}'// TwitchNoSub (0.9.1)
    ];
    function getCleanWorker(worker) {
        let root = null;
        let parent = null;
        let proto = worker;
        while (proto) {
            const workerString = proto.toString();
            if (workerStringConflicts.some((x) => workerString.includes(x)) && !workerStringAllow.some((x) => workerString.includes(x))) {
                if (parent !== null) {
                    Object.setPrototypeOf(parent, Object.getPrototypeOf(proto));
                }
            } else {
                if (root === null) {
                    root = proto;
                }
                parent = proto;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return root;
    }
    function getWorkersForReinsert(worker) {
        const result = [];
        let proto = worker;
        while (proto) {
            const workerString = proto.toString();
            if (workerStringReinsert.some((x) => workerString.includes(x))) {
                result.push(proto);
            } else {
            }
            proto = Object.getPrototypeOf(proto);
        }
        return result;
    }
    function reinsertWorkers(worker, reinsert) {
        let parent = worker;
        for (let i = 0; i < reinsert.length; i++) {
            Object.setPrototypeOf(reinsert[i], parent);
            parent = reinsert[i];
        }
        return parent;
    }
    function isValidWorker(worker) {
        const workerString = worker.toString();
        return !workerStringConflicts.some((x) => workerString.includes(x))
            || workerStringAllow.some((x) => workerString.includes(x))
            || workerStringReinsert.some((x) => workerString.includes(x));
    }
    function hookWindowWorker() {
        const reinsert = getWorkersForReinsert(window.Worker);
        const newWorker = class Worker extends getCleanWorker(window.Worker) {
            constructor(twitchBlobUrl, options) {
                let isTwitchWorker = false;
                try {
                    isTwitchWorker = new URL(twitchBlobUrl).origin.endsWith('.twitch.tv');
                } catch {}
                if (!isTwitchWorker) {
                    super(twitchBlobUrl, options);
                    return;
                }
                const newBlobStr = `
                    const pendingFetchRequests = new Map();
                    ${stripAdSegments.toString()}
                    ${getStreamUrlForResolution.toString()}
                    ${processM3U8.toString()}
                    ${hookWorkerFetch.toString()}
                    ${declareOptions.toString()}
                    ${getAccessToken.toString()}
                    ${gqlRequest.toString()}
                    ${parseAttributes.toString()}
                    ${getWasmWorkerJs.toString()}
                    ${getServerTimeFromM3u8.toString()}
                    ${replaceServerTimeInM3u8.toString()}
                    ${isEncodingsCacheAlive.toString()}
                    ${getCachedAccessToken.toString()}
                    ${fetchBackupEncodings.toString()}
                    const workerString = getWasmWorkerJs('${twitchBlobUrl.replaceAll("'", "%27")}');
                    declareOptions(self);
                    GQLDeviceID = ${GQLDeviceID ? "'" + GQLDeviceID + "'" : null};
                    AuthorizationHeader = ${AuthorizationHeader ? "'" + AuthorizationHeader + "'" : undefined};
                    ClientIntegrityHeader = ${ClientIntegrityHeader ? "'" + ClientIntegrityHeader + "'" : null};
                    ClientVersion = ${ClientVersion ? "'" + ClientVersion + "'" : null};
                    ClientSession = ${ClientSession ? "'" + ClientSession + "'" : null};
                    self.addEventListener('message', function(e) {
                        if (e.data.key == 'UpdateClientVersion') {
                            ClientVersion = e.data.value;
                        } else if (e.data.key == 'UpdateClientSession') {
                            ClientSession = e.data.value;
                        } else if (e.data.key == 'UpdateClientId') {
                            ClientID = e.data.value;
                        } else if (e.data.key == 'UpdateDeviceId') {
                            GQLDeviceID = e.data.value;
                        } else if (e.data.key == 'UpdateClientIntegrityHeader') {
                            ClientIntegrityHeader = e.data.value;
                        } else if (e.data.key == 'UpdateAuthorizationHeader') {
                            AuthorizationHeader = e.data.value;
                        } else if (e.data.key == 'FetchResponse') {
                            const responseData = e.data.value;
                            if (pendingFetchRequests.has(responseData.id)) {
                                const { resolve, reject } = pendingFetchRequests.get(responseData.id);
                                pendingFetchRequests.delete(responseData.id);
                                if (responseData.error) {
                                    reject(new Error(responseData.error));
                                } else {
                                    // Create a Response object from the response data
                                    const response = new Response(responseData.body, {
                                        status: responseData.status,
                                        statusText: responseData.statusText,
                                        headers: responseData.headers
                                    });
                                    resolve(response);
                                }
                            }
                        } else if (e.data.key == 'TriggeredPlayerReload') {
                            HasTriggeredPlayerReload = true;
                        } else if (e.data.key == 'SimulateAds') {
                            SimulatedAdsDepth = e.data.value;
                            console.log('SimulatedAdsDepth: ' + SimulatedAdsDepth);
                        } else if (e.data.key == 'AllSegmentsAreAdSegments') {
                            AllSegmentsAreAdSegments = !AllSegmentsAreAdSegments;
                            console.log('AllSegmentsAreAdSegments: ' + AllSegmentsAreAdSegments);
                        }
                    });
                    hookWorkerFetch();
                    eval(workerString);
                `;
                super(URL.createObjectURL(new Blob([newBlobStr])), options);
                twitchWorkers.push(this);
                this.addEventListener('message', (e) => {
                    if (e.data.key == 'UpdateAdBlockBanner') {
                        updateAdblockBanner(e.data);
                    } else if (e.data.key == 'PauseResumePlayer') {
                        doTwitchPlayerTask(true, false);
                    } else if (e.data.key == 'ReloadPlayer') {
                        doTwitchPlayerTask(false, true);
                    }
                });
                this.addEventListener('message', async event => {
                    if (event.data.key == 'FetchRequest') {
                        const fetchRequest = event.data.value;
                        const responseData = await handleWorkerFetchRequest(fetchRequest);
                        this.postMessage({
                            key: 'FetchResponse',
                            value: responseData
                        });
                    }
                });
            }
        };
        let workerInstance = reinsertWorkers(newWorker, reinsert);
        Object.defineProperty(window, 'Worker', {
            get: function() {
                return workerInstance;
            },
            set: function(value) {
                if (isValidWorker(value)) {
                    workerInstance = value;
                } else {
                    console.log('Attempt to set twitch worker denied');
                }
            }
        });
    }
    function getWasmWorkerJs(twitchBlobUrl) {
        // Blob URLs are per-worker and immutable, so the same worker script is
        // never read twice. The cache lives on the function itself so the copy
        // that gets stringified into the worker needs no extra global.
        const cache = getWasmWorkerJs.cache || (getWasmWorkerJs.cache = new Map());
        const cached = cache.get(twitchBlobUrl);
        if (cached) {
            return cached;
        }
        const req = new XMLHttpRequest();
        req.open('GET', twitchBlobUrl, false);
        req.overrideMimeType("text/javascript");
        req.send();
        const text = req.responseText;
        if (text) {
            cache.set(twitchBlobUrl, text);
        }
        return text;
    }
    function hookWorkerFetch() {
        console.log('hookWorkerFetch (TwitchAdv)');
        const realFetch = fetch;
        fetch = async function(url, options) {
            if (typeof url === 'string') {
                if (AdSegmentCache.has(url)) {
                    return new Promise(function(resolve, reject) {
                        const send = function() {
                            return realFetch('data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAYagAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAABqHRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAURtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAALuAAAAAAFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAADvbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAACzc3RibAAAAGdzdHNkAAAAAAAAAAEAAABXbXA0YQAAAAAAAAABAAAAAAAAAAAAAgAQAAAAALuAAAAAAAAzZXNkcwAAAAADgICAIgABAASAgIAUQBUAAAAAAAAAAAAAAAWAgIACEZAGgICAAQIAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAeV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAoAAAAFoAAAAAAGBbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAA9CQAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABLG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAOxzdGJsAAAAoHN0c2QAAAAAAAAAAQAAAJBhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAoABaABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAOmF2Y0MBTUAe/+EAI2dNQB6WUoFAX/LgLUBAQFAAAD6AAA6mDgAAHoQAA9CW7y4KAQAEaOuPIAAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAASG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAC4AAAAAAoAAAAAAACB0cmV4AAAAAAAAAAIAAAABAACCNQAAAAACQAAA', options).then(function(response) {
                                resolve(response);
                            })['catch'](function(err) {
                                reject(err);
                            });
                        };
                        send();
                    });
                }
                url = url.trimEnd();
                if (url.endsWith('m3u8')) {
                    return new Promise(function(resolve, reject) {
                        const processAfter = async function(response) {
                            if (response.status !== 200) {
                                resolve(response);
                                return;
                            }
                            const text = await response.text();
                            let body = text;
                            try {
                                body = await processM3U8(url, text, realFetch);
                            } catch (err) {
                                // A rewrite failure must never leave the player hanging.
                                console.log('TwitchAdv: playlist rewrite failed, serving original (' + err + ')');
                            }
                            resolve(new Response(body));
                        };
                        const send = function() {
                            return realFetch(url, options).then(function(response) {
                                return processAfter(response);
                            })['catch'](function(err) {
                                reject(err);
                            });
                        };
                        send();
                    });
                } else if (url.includes('/channel/hls/') && !url.includes('picture-by-picture')) {
                    V2API = url.includes('/api/v2/');
                    const channelNameMatch = (new URL(url)).pathname.match(/([^\/]+)(?=\.\w+$)/);
                    if (!channelNameMatch) {
                        return realFetch.apply(this, arguments);
                    }
                    const channelName = channelNameMatch[0];
                    if (ForceAccessTokenPlayerType) {
                        // parent_domains is used to determine if the player is embeded and stripping it gets rid of fake ads
                        const tempUrl = new URL(url);
                        tempUrl.searchParams.delete('parent_domains');
                        url = tempUrl.toString();
                    }
                    return new Promise(function(resolve, reject) {
                        const processAfter = async function(response) {
                            if (response.status == 200) {
                                const encodingsM3u8 = await response.text();
                                const serverTime = getServerTimeFromM3u8(encodingsM3u8);
                                let streamInfo = StreamInfos[channelName];
                                if (streamInfo != null && streamInfo.EncodingsM3U8 != null && !(await isEncodingsCacheAlive(streamInfo, realFetch))) {
                                    // The cached encodings are dead (the stream probably restarted)
                                    streamInfo = null;
                                }
                                if (streamInfo == null || streamInfo.EncodingsM3U8 == null) {
                                    StreamInfos[channelName] = streamInfo = {
                                        ChannelName: channelName,
                                        IsShowingAd: false,
                                        LastPlayerReload: 0,
                                        EncodingsM3U8: encodingsM3u8,
                                        ModifiedM3U8: null,
                                        IsUsingModifiedM3U8: false,
                                        UsherParams: (new URL(url)).search,
                                        RequestedAds: new Set(),
                                        Urls: [],// xxx.m3u8 -> { Resolution: "284x160", FrameRate: 30.0 }
                                        ResolutionList: [],
                                        BackupEncodingsM3U8Cache: [],
                                        AccessTokens: {},
                                        LastEncodingsCheck: Date.now(),
                                        ActiveBackupPlayerType: null,
                                        IsMidroll: false,
                                        IsStrippingAdSegments: false,
                                        NumStrippedAdSegments: 0
                                    };
                                    const lines = encodingsM3u8.replaceAll('\r', '').split('\n');
                                    for (let i = 0; i < lines.length - 1; i++) {
                                        if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1].includes('.m3u8')) {
                                            const attributes = parseAttributes(lines[i]);
                                            const resolution = attributes['RESOLUTION'];
                                            if (resolution) {
                                                const resolutionInfo = {
                                                    Resolution: resolution,
                                                    FrameRate: attributes['FRAME-RATE'],
                                                    Codecs: attributes['CODECS'],
                                                    Url: lines[i + 1]
                                                };
                                                streamInfo.Urls[lines[i + 1]] = resolutionInfo;
                                                streamInfo.ResolutionList.push(resolutionInfo);
                                            }
                                            StreamInfosByUrl[lines[i + 1]] = streamInfo;
                                        }
                                    }
                                    const nonHevcResolutionList = streamInfo.ResolutionList.filter((element) => element.Codecs.startsWith('avc') || element.Codecs.startsWith('av0'));
                                    if (AlwaysReloadPlayerOnAd || (nonHevcResolutionList.length > 0 && streamInfo.ResolutionList.some((element) => element.Codecs.startsWith('hev') || element.Codecs.startsWith('hvc')) && !SkipPlayerReloadOnHevc)) {
                                        if (nonHevcResolutionList.length > 0) {
                                            for (let i = 0; i < lines.length - 1; i++) {
                                                if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                                                    const resSettings = parseAttributes(lines[i].substring(lines[i].indexOf(':') + 1));
                                                    const codecsKey = 'CODECS';
                                                    if (resSettings[codecsKey].startsWith('hev') || resSettings[codecsKey].startsWith('hvc')) {
                                                        const oldResolution = resSettings['RESOLUTION'];
                                                        const [targetWidth, targetHeight] = oldResolution.split('x').map(Number);
                                                        const newResolutionInfo = nonHevcResolutionList.sort((a, b) => {
                                                            // TODO: Take into account 'Frame-Rate' when sorting (i.e. 1080p60 vs 1080p30)
                                                            const [streamWidthA, streamHeightA] = a.Resolution.split('x').map(Number);
                                                            const [streamWidthB, streamHeightB] = b.Resolution.split('x').map(Number);
                                                            return Math.abs((streamWidthA * streamHeightA) - (targetWidth * targetHeight)) - Math.abs((streamWidthB * streamHeightB) - (targetWidth * targetHeight));
                                                        })[0];
                                                        console.log('ModifiedM3U8 swap ' + resSettings[codecsKey] + ' to ' + newResolutionInfo.Codecs + ' oldRes:' + oldResolution + ' newRes:' + newResolutionInfo.Resolution);
                                                        lines[i] = lines[i].replace(/CODECS="[^"]+"/, `CODECS="${newResolutionInfo.Codecs}"`);
                                                        lines[i + 1] = newResolutionInfo.Url + ' '.repeat(i + 1);// The stream doesn't load unless each url line is unique
                                                    }
                                                }
                                            }
                                        }
                                        if (nonHevcResolutionList.length > 0 || AlwaysReloadPlayerOnAd) {
                                            streamInfo.ModifiedM3U8 = lines.join('\n');
                                        }
                                    }
                                }
                                streamInfo.LastPlayerReload = Date.now();
                                resolve(new Response(replaceServerTimeInM3u8(streamInfo.IsUsingModifiedM3U8 ? streamInfo.ModifiedM3U8 : streamInfo.EncodingsM3U8, serverTime)));
                            } else {
                                resolve(response);
                            }
                        };
                        const send = function() {
                            return realFetch(url, options).then(function(response) {
                                return processAfter(response).catch(function(err) {
                                    // Never leave the player waiting: re-fetch the
                                    // untouched usher playlist and hand that over.
                                    console.log('TwitchAdv: usher rewrite failed, serving original (' + err + ')');
                                    return realFetch(url, options).then(resolve, reject);
                                });
                            })['catch'](function(err) {
                                reject(err);
                            });
                        };
                        send();
                    });
                }
            }
            return realFetch.apply(this, arguments);
        };
    }
    function getServerTimeFromM3u8(encodingsM3u8) {
        // A playlist without SERVER-TIME is normal on some usher responses. The old
        // code read `.length` off a null match and threw, which hung the playlist
        // fetch and left the player spinning on first load.
        if (!encodingsM3u8) {
            return null;
        }
        const matches = V2API
            ? encodingsM3u8.match(/#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/)
            : encodingsM3u8.match(/SERVER-TIME="([0-9.]+)"/);
        return matches ? matches[1] : null;
    }
    async function isEncodingsCacheAlive(streamInfo, realFetch) {
        const url = streamInfo.EncodingsM3U8 && streamInfo.EncodingsM3U8.match(/^https:.*\.m3u8$/m);
        if (!url) {
            return true;// Nothing to verify against, keep the cache.
        }
        const now = Date.now();
        if (now - (streamInfo.LastEncodingsCheck || 0) < 15000) {
            return true;// Revalidating on every usher hit cost a full round trip per load.
        }
        try {
            const response = await realFetch(url[0]);
            streamInfo.LastEncodingsCheck = now;
            return response.status === 200;
        } catch (err) {
            return true;
        }
    }
    function getCachedAccessToken(streamInfo, playerType) {
        // Playback tokens stay valid for minutes. The old code re-ran the GQL
        // round trip through the main thread on every single ad break.
        streamInfo.AccessTokens = streamInfo.AccessTokens || {};
        const cached = streamInfo.AccessTokens[playerType];
        if (cached && Date.now() - cached.time < 60000) {
            return Promise.resolve(cached.token);
        }
        const request = getAccessToken(streamInfo.ChannelName, playerType).then(async function(response) {
            if (!response || response.status !== 200) {
                return null;
            }
            const json = await response.json();
            const token = json && json.data && json.data.streamPlaybackAccessToken;
            if (!token) {
                return null;
            }
            streamInfo.AccessTokens[playerType] = { token: token, time: Date.now() };
            return token;
        })['catch'](function() {
            return null;
        });
        // The token request round-trips through the main thread. If that answer
        // never arrives the player must not sit on the ad playlist forever.
        const timeout = new Promise(function(resolve) {
            setTimeout(function() {
                resolve(null);
            }, 5000);
        });
        return Promise.race([request, timeout]);
    }
    async function fetchBackupEncodings(streamInfo, playerType, realFetch) {
        const cached = streamInfo.BackupEncodingsM3U8Cache[playerType];
        if (cached) {
            return cached;
        }
        try {
            const token = await getCachedAccessToken(streamInfo, playerType.replace('-CACHED', ''));
            if (!token) {
                return null;
            }
            const urlInfo = new URL('https://usher.ttvnw.net/api/' + (V2API ? 'v2/' : '') + 'channel/hls/' + streamInfo.ChannelName + '.m3u8' + streamInfo.UsherParams);
            urlInfo.searchParams.set('sig', token.signature);
            urlInfo.searchParams.set('token', token.value);
            const response = await realFetch(urlInfo.href);
            if (response.status !== 200) {
                return null;
            }
            const encodingsM3u8 = await response.text();
            streamInfo.BackupEncodingsM3U8Cache[playerType] = encodingsM3u8;
            return encodingsM3u8;
        } catch (err) {
            return null;
        }
    }
    function replaceServerTimeInM3u8(encodingsM3u8, newServerTime) {
        if (V2API) {
            return newServerTime ? encodingsM3u8.replace(/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/, `$1${newServerTime}$2`) : encodingsM3u8;
        }
        return newServerTime ? encodingsM3u8.replace(new RegExp('(SERVER-TIME=")[0-9.]+"'), `SERVER-TIME="${newServerTime}"`) : encodingsM3u8;
    }
    function stripAdSegments(textStr, stripAllSegments, streamInfo) {
        let hasStrippedAdSegments = false;
        const lines = textStr.replaceAll('\r', '').split('\n');
        const newAdUrl = 'https://twitch.tv';
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            // Remove tracking urls which appear in the overlay UI
            line = line
                .replaceAll(/(X-TV-TWITCH-AD-URL=")(?:[^"]*)(")/g, `$1${newAdUrl}$2`)
                .replaceAll(/(X-TV-TWITCH-AD-CLICK-TRACKING-URL=")(?:[^"]*)(")/g, `$1${newAdUrl}$2`);
            if (i < lines.length - 1 && line.startsWith('#EXTINF') && (!line.includes(',live') || stripAllSegments || AllSegmentsAreAdSegments)) {
                const segmentUrl = lines[i + 1];
                if (!AdSegmentCache.has(segmentUrl)) {
                    streamInfo.NumStrippedAdSegments++;
                }
                AdSegmentCache.set(segmentUrl, Date.now());
                hasStrippedAdSegments = true;
            }
            if (line.includes(AdSignifier)) {
                hasStrippedAdSegments = true;
            }
        }
        if (hasStrippedAdSegments) {
            for (let i = 0; i < lines.length; i++) {
                // No low latency during ads (otherwise it's possible for the player to prefetch and display ad segments)
                if (lines[i].startsWith('#EXT-X-TWITCH-PREFETCH:')) {
                    lines[i] = '';
                }
            }
        } else {
            streamInfo.NumStrippedAdSegments = 0;
        }
        streamInfo.IsStrippingAdSegments = hasStrippedAdSegments;
        AdSegmentCache.forEach((value, key, map) => {
            if (value < Date.now() - 120000) {
                map.delete(key);
            }
        });
        return lines.join('\n');
    }
    function getStreamUrlForResolution(encodingsM3u8, resolutionInfo) {
        const encodingsLines = encodingsM3u8.replaceAll('\r', '').split('\n');
        const [targetWidth, targetHeight] = resolutionInfo.Resolution.split('x').map(Number);
        const targetArea = targetWidth * targetHeight;
        let matchedResolutionUrl = null;
        let matchedFrameRate = false;
        let higherResolutionUrl = null;
        let higherResolutionDifference = Infinity;
        for (let i = 0; i < encodingsLines.length - 1; i++) {
            if (encodingsLines[i].startsWith('#EXT-X-STREAM-INF') && encodingsLines[i + 1].includes('.m3u8')) {
                const attributes = parseAttributes(encodingsLines[i]);
                const resolution = attributes['RESOLUTION'];
                const frameRate = attributes['FRAME-RATE'];
                if (resolution) {
                    if (resolution == resolutionInfo.Resolution && (!matchedResolutionUrl || (!matchedFrameRate && frameRate == resolutionInfo.FrameRate))) {
                        matchedResolutionUrl = encodingsLines[i + 1];
                        matchedFrameRate = frameRate == resolutionInfo.FrameRate;
                        if (matchedFrameRate) {
                            return matchedResolutionUrl;
                        }
                    }
                    const [width, height] = resolution.split('x').map(Number);
                    const area = width * height;
                    const difference = area - targetArea;
                    if (difference >= 0 && difference < higherResolutionDifference) {
                        higherResolutionUrl = encodingsLines[i + 1];
                        higherResolutionDifference = difference;
                    }
                }
            }
        }
        return matchedResolutionUrl || higherResolutionUrl;
    }
    async function processM3U8(url, textStr, realFetch) {
        const streamInfo = StreamInfosByUrl[url];
        if (!streamInfo) {
            return textStr;
        }
        if (HasTriggeredPlayerReload) {
            HasTriggeredPlayerReload = false;
            streamInfo.LastPlayerReload = Date.now();
        }
        const haveAdTags = textStr.includes(AdSignifier) || SimulatedAdsDepth > 0;
        if (haveAdTags) {
            streamInfo.IsMidroll = textStr.includes('"MIDROLL"') || textStr.includes('"midroll"');
            if (!streamInfo.IsShowingAd) {
                streamInfo.IsShowingAd = true;
                postMessage({
                    key: 'UpdateAdBlockBanner',
                    isMidroll: streamInfo.IsMidroll,
                    hasAds: streamInfo.IsShowingAd,
                    isStrippingAdSegments: false
                });
            }
            if (!streamInfo.IsMidroll) {
                const lines = textStr.replaceAll('\r', '').split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.startsWith('#EXTINF') && lines.length > i + 1) {
                        if (!line.includes(',live') && !streamInfo.RequestedAds.has(lines[i + 1])) {
                            // Only request one .ts file per .m3u8 request to avoid making too many requests
                            //console.log('Fetch ad .ts file');
                            streamInfo.RequestedAds.add(lines[i + 1]);
                            fetch(lines[i + 1]).then((response)=>{response.blob()});
                            break;
                        }
                    }
                }
            }
            const currentResolution = streamInfo.Urls[url];
            if (!currentResolution) {
                console.log('Ads will leak due to missing resolution info for ' + url);
                return textStr;
            }
            const isHevc = currentResolution.Codecs.startsWith('hev') || currentResolution.Codecs.startsWith('hvc');
            if (((isHevc && !SkipPlayerReloadOnHevc) || AlwaysReloadPlayerOnAd) && streamInfo.ModifiedM3U8 && !streamInfo.IsUsingModifiedM3U8) {
                streamInfo.IsUsingModifiedM3U8 = true;
                streamInfo.LastPlayerReload = Date.now();
                postMessage({
                    key: 'ReloadPlayer'
                });
            }
            let backupPlayerType = null;
            let backupM3u8 = null;
            let fallbackM3u8 = null;
            let isDoingMinimalRequests = false;
            if (streamInfo.LastPlayerReload > Date.now() - PlayerReloadMinimalRequestsTime) {
                // When doing player reload there are a lot of requests which causes the backup stream to load in slow. Briefly prefer using a single version to prevent long delays
                isDoingMinimalRequests = true;
            }
            const playerTypes = isDoingMinimalRequests
                ? [BackupPlayerTypes[PlayerReloadMinimalRequestsPlayerIndex] || BackupPlayerTypes[0]]
                : BackupPlayerTypes;
            // Both player types are always needed, so their usher playlists go out
            // in parallel. Sequentially they added a full round trip each, and that
            // wait is exactly what "the stream is slow after an ad" looked like.
            const encodingsList = await Promise.all(playerTypes.map(function (playerType) {
                return fetchBackupEncodings(streamInfo, playerType, realFetch);
            }));
            const backupPlaylists = await Promise.all(encodingsList.map(function (encodingsM3u8, index) {
                if (!encodingsM3u8) {
                    return null;
                }
                const streamM3u8Url = getStreamUrlForResolution(encodingsM3u8, currentResolution);
                if (!streamM3u8Url) {
                    return null;
                }
                return realFetch(streamM3u8Url).then(function (response) {
                    return response.status == 200 ? response.text() : null;
                })['catch'](function () {
                    streamInfo.BackupEncodingsM3U8Cache[playerTypes[index]] = null;// The variant urls died with the stream
                    return null;
                });
            }));
            for (let i = 0; i < playerTypes.length; i++) {
                const m3u8Text = backupPlaylists[i];
                if (!m3u8Text) {
                    continue;
                }
                if (playerTypes[i] == FallbackPlayerType) {
                    fallbackM3u8 = m3u8Text;
                }
                if (!m3u8Text.includes(AdSignifier) && (SimulatedAdsDepth == 0 || i >= SimulatedAdsDepth - 1)) {
                    backupPlayerType = playerTypes[i];
                    backupM3u8 = m3u8Text;
                    break;
                }
                if (!backupM3u8) {
                    // Keep the first ad-bearing playlist as a last resort instead of
                    // leaving the player on the ad playlist it already has.
                    backupPlayerType = playerTypes[i];
                    backupM3u8 = m3u8Text;
                }
            }
            if (!backupM3u8 && fallbackM3u8) {
                backupPlayerType = FallbackPlayerType;
                backupM3u8 = fallbackM3u8;
            }
            if (backupM3u8) {
                textStr = backupM3u8;
                if (streamInfo.ActiveBackupPlayerType != backupPlayerType) {
                    streamInfo.ActiveBackupPlayerType = backupPlayerType;
                    console.log(`Blocking${(streamInfo.IsMidroll ? ' midroll ' : ' ')}ads (${backupPlayerType})`);
                }
            }
            // TODO: Improve hevc stripping. It should always strip when there is a codec mismatch (both ways)
            const stripHevc = isHevc && streamInfo.ModifiedM3U8;
            if (IsAdStrippingEnabled || stripHevc) {
                textStr = stripAdSegments(textStr, stripHevc, streamInfo);
            }
        } else if (streamInfo.IsShowingAd) {
            console.log('Finished blocking ads');
            streamInfo.IsShowingAd = false;
            streamInfo.IsStrippingAdSegments = false;
            streamInfo.NumStrippedAdSegments = 0;
            streamInfo.ActiveBackupPlayerType = null;
            if (streamInfo.IsUsingModifiedM3U8 || ReloadPlayerAfterAd) {
                streamInfo.IsUsingModifiedM3U8 = false;
                streamInfo.LastPlayerReload = Date.now();
                postMessage({
                    key: 'ReloadPlayer'
                });
            } else {
                postMessage({
                    key: 'PauseResumePlayer'
                });
            }
        }
        postMessage({
            key: 'UpdateAdBlockBanner',
            isMidroll: streamInfo.IsMidroll,
            hasAds: streamInfo.IsShowingAd,
            isStrippingAdSegments: streamInfo.IsStrippingAdSegments,
            numStrippedAdSegments: streamInfo.NumStrippedAdSegments
        });
        return textStr;
    }
    function parseAttributes(str) {
        return Object.fromEntries(
            str.split(/(?:^|,)((?:[^=]*)=(?:"[^"]*"|[^,]*))/)
            .filter(Boolean)
            .map(x => {
                const idx = x.indexOf('=');
                const key = x.substring(0, idx);
                const value = x.substring(idx + 1);
                const num = Number(value);
                return [key, Number.isNaN(num) ? value.startsWith('"') ? JSON.parse(value) : value : num];
            }));
    }
    function getAccessToken(channelName, playerType) {
        const body = {
            operationName: 'PlaybackAccessToken',
            variables: {
                isLive: true,
                login: channelName,
                isVod: false,
                vodID: "",
                playerType: playerType,
                platform: playerType == 'autoplay' ? 'android' : 'web'
            },
            extensions: {
                persistedQuery: {
                    version:1,
                    sha256Hash:"ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9"
                }
            }
        };
        return gqlRequest(body, playerType);
    }
    function gqlRequest(body, playerType) {
        if (!GQLDeviceID) {
            GQLDeviceID = '';
            const dcharacters = 'abcdefghijklmnopqrstuvwxyz0123456789';
            const dcharactersLength = dcharacters.length;
            for (let i = 0; i < 32; i++) {
                GQLDeviceID += dcharacters.charAt(Math.floor(Math.random() * dcharactersLength));
            }
        }
        let headers = {
            'Client-ID': ClientID,
            'X-Device-Id': GQLDeviceID,
            'Authorization': AuthorizationHeader,
            ...(ClientIntegrityHeader && {'Client-Integrity': ClientIntegrityHeader}),
            ...(ClientVersion && {'Client-Version': ClientVersion}),
            ...(ClientSession && {'Client-Session-Id': ClientSession})
        };
        return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substring(2, 15);
            const fetchRequest = {
                id: requestId,
                url: 'https://gql.twitch.tv/gql',
                options: {
                    method: 'POST',
                    body: JSON.stringify(body),
                    headers
                }
            };
            pendingFetchRequests.set(requestId, {
                resolve,
                reject
            });
            postMessage({
                key: 'FetchRequest',
                value: fetchRequest
            });
        });
    }
    let playerForMonitoringBuffering = null;
    const playerBufferState = {
        channelName: null,
        hasStreamStarted: false,
        position: 0,
        bufferedPosition: 0,
        bufferDuration: 0,
        numSame: 0,
        lastFixTime: 0,
        isLive: true
    };
    function monitorPlayerBuffering() {
        if (playerForMonitoringBuffering) {
            try {
                const player = playerForMonitoringBuffering.player;
                const state = playerForMonitoringBuffering.state;
                if (!player.core) {
                    playerForMonitoringBuffering = null;
                } else if (state.props?.content?.type === 'live' && !player.isPaused() && !player.getHTMLVideoElement()?.ended && playerBufferState.lastFixTime <= Date.now() - PlayerBufferingMinRepeatDelay && !isActivelyStrippingAds) {
                    const m3u8Url = player.core?.state?.path;
                    if (m3u8Url) {
                      const fileName = new URL(m3u8Url).pathname.split('/').pop();
                      if (fileName?.endsWith('.m3u8')) {
                          const channelName = fileName.slice(0, -5);
                          if (playerBufferState.channelName != channelName) {
                              playerBufferState.channelName = channelName;
                              playerBufferState.hasStreamStarted = false;
                              playerBufferState.numSame = 0;
                              //console.log('Channel changed to ' + channelName);
                          }
                      }
                    }
                    if (player.getState() === 'Playing') {
                        playerBufferState.hasStreamStarted = true;
                    }
                    const position = player.core?.state?.position;
                    const bufferedPosition = player.core?.state?.bufferedPosition;
                    const bufferDuration = player.getBufferDuration();
                    if (position !== undefined && bufferedPosition !== undefined) {
                        //console.log('position:' + position + ' bufferDuration:' + bufferDuration + ' bufferPosition:' + bufferedPosition + ' state: ' + player.core?.state?.state + ' started: ' + playerBufferState.hasStreamStarted);
                        // NOTE: This could be improved. It currently lets the player fully eat the full buffer before it triggers pause/play
                        if (playerBufferState.hasStreamStarted &&
                            (!PlayerBufferingPrerollCheckEnabled || position > PlayerBufferingPrerollCheckOffset) &&
                            (playerBufferState.position == position || bufferDuration < PlayerBufferingDangerZone)  &&
                            playerBufferState.bufferedPosition == bufferedPosition &&
                            playerBufferState.bufferDuration >= bufferDuration &&
                            (position != 0 || bufferedPosition != 0 || bufferDuration != 0)
                        ) {
                            playerBufferState.numSame++;
                            if (playerBufferState.numSame == PlayerBufferingSameStateCount) {
                                console.log('Attempt to fix buffering position:' + playerBufferState.position + ' bufferedPosition:' + playerBufferState.bufferedPosition + ' bufferDuration:' + playerBufferState.bufferDuration);
                                const isPausePlay = !PlayerBufferingDoPlayerReload;
                                const isReload = PlayerBufferingDoPlayerReload;
                                doTwitchPlayerTask(isPausePlay, isReload);
                                playerBufferState.lastFixTime = Date.now();
                                playerBufferState.numSame = 0;
                            }
                        } else {
                            playerBufferState.numSame = 0;
                        }
                        playerBufferState.position = position;
                        playerBufferState.bufferedPosition = bufferedPosition;
                        playerBufferState.bufferDuration = bufferDuration;
                    } else {
                        playerBufferState.numSame = 0;
                    }
                }
            } catch (err) {
                console.error('error when monitoring player for buffering: ' + err);
                playerForMonitoringBuffering = null;
            }
        }
        if (!playerForMonitoringBuffering && document.querySelector('video')) {
            // Walking the whole React fiber tree is expensive. Only do it once the
            // video element exists; on page load this used to run every 600 ms
            // against a tree with thousands of fibers.
            const playerAndState = getPlayerAndState();
            if (playerAndState && playerAndState.player && playerAndState.state) {
                playerForMonitoringBuffering = {
                    player: playerAndState.player,
                    state: playerAndState.state
                };
            }
        }
        const isLive = playerForMonitoringBuffering?.state?.props?.content?.type === 'live';
        if (playerBufferState.isLive && !isLive) {
            updateAdblockBanner({
                hasAds: false
            });
        }
        playerBufferState.isLive = isLive;
        setTimeout(monitorPlayerBuffering, playerForMonitoringBuffering ? PlayerBufferingDelay : 1500);
    }
    let adBannerLastUpdate = 0;
    let lastAdMessageAt = 0;
    let adBannerVisible = false;

    function hideAdblockBanner() {
        const playerRootDiv = document.querySelector('.video-player');
        const adBlockDiv = playerRootDiv && playerRootDiv.querySelector('.adblock-overlay');
        if (adBlockDiv) {
            adBlockDiv.style.display = 'none';
        }
        adBannerVisible = false;
    }

    function updateAdblockBanner(data) {
        lastAdMessageAt = Date.now();
        isActivelyStrippingAds = !!data.isStrippingAdSegments;
        if (!ShowAdBlockBanner) {
            // Cosmetic only. It used to sit on screen forever once the player
            // moved to a playlist URL the worker stopped tracking.
            if (adBannerVisible) {
                hideAdblockBanner();
            }
            return;
        }
        const playerRootDiv = document.querySelector('.video-player');
        if (playerRootDiv != null) {
            let adBlockDiv = null;
            adBlockDiv = playerRootDiv.querySelector('.adblock-overlay');
            if (adBlockDiv == null) {
                adBlockDiv = document.createElement('div');
                adBlockDiv.className = 'adblock-overlay';
                adBlockDiv.innerHTML = '<div class="player-adblock-notice" style="color: white; background-color: rgba(0, 0, 0, 0.8); position: absolute; top: 0px; left: 0px; padding: 5px;"><p></p></div>';
                adBlockDiv.style.display = 'none';
                adBlockDiv.P = adBlockDiv.querySelector('p');
                playerRootDiv.appendChild(adBlockDiv);
            }
            if (adBlockDiv != null) {
                adBlockDiv.P.textContent = 'Blocking' + (data.isMidroll ? ' midroll' : '') + ' ads' + (data.isStrippingAdSegments ? ' (stripping)' : '');// + (data.numStrippedAdSegments > 0 ? ` (${data.numStrippedAdSegments})` : '');
                const shouldShow = !!(data.hasAds && playerBufferState.isLive);
                if (shouldShow) {
                    adBannerLastUpdate = Date.now();
                }
                adBlockDiv.style.display = shouldShow ? 'block' : 'none';
                adBannerVisible = shouldShow;
            }
        }
    }

    // Watchdog: if the worker stops sending ad state (the player switched to a
    // playlist URL it no longer tracks) the notice is cleared instead of sitting
    // there until the tab is reloaded.
    setInterval(function() {
        if (adBannerVisible && Date.now() - adBannerLastUpdate > 10000) {
            hideAdblockBanner();
        }
        if (isActivelyStrippingAds && Date.now() - lastAdMessageAt > 15000) {
            isActivelyStrippingAds = false;
        }
    }, 2000);
    function getPlayerAndState() {
        function findReactNode(root, constraint) {
            if (root.stateNode && constraint(root.stateNode)) {
                return root.stateNode;
            }
            let node = root.child;
            while (node) {
                const result = findReactNode(node, constraint);
                if (result) {
                    return result;
                }
                node = node.sibling;
            }
            return null;
        }
        function findReactRootNode() {
            let reactRootNode = null;
            const rootNode = document.querySelector('#root');
            if (rootNode && rootNode._reactRootContainer && rootNode._reactRootContainer._internalRoot && rootNode._reactRootContainer._internalRoot.current) {
                reactRootNode = rootNode._reactRootContainer._internalRoot.current;
            }
            if (reactRootNode == null && rootNode != null) {
                const containerName = Object.keys(rootNode).find(x => x.startsWith('__reactContainer'));
                if (containerName != null) {
                    reactRootNode = rootNode[containerName];
                }
            }
            return reactRootNode;
        }
        const reactRootNode = findReactRootNode();
        if (!reactRootNode) {
            return null;
        }
        let player = findReactNode(reactRootNode, node => node.setPlayerActive && node.props && node.props.mediaPlayerInstance);
        player = player && player.props && player.props.mediaPlayerInstance ? player.props.mediaPlayerInstance : null;
        if (player?.playerInstance) {
            player = player.playerInstance;
        }
        const playerState = findReactNode(reactRootNode, node => node.setSrc && node.setInitialPlaybackSettings);
        return  {
            player: player,
            state: playerState
        };
    }
    function doTwitchPlayerTask(isPausePlay, isReload) {
        const playerAndState = getPlayerAndState();
        if (!playerAndState) {
            console.log('Could not find react root');
            return;
        }
        const player = playerAndState.player;
        const playerState = playerAndState.state;
        if (!player) {
            console.log('Could not find player');
            return;
        }
        if (!playerState) {
            console.log('Could not find player state');
            return;
        }
        if (player.isPaused() || player.core?.paused) {
            return;
        }
        playerBufferState.lastFixTime = Date.now();
        playerBufferState.numSame = 0;
        if (isPausePlay) {
            player.pause();
            player.play();
            return;
        }
        if (isReload) {
            const lsKeyQuality = 'video-quality';
            const lsKeyMuted = 'video-muted';
            const lsKeyVolume = 'volume';
            let currentQualityLS = null;
            let currentMutedLS = null;
            let currentVolumeLS = null;
            try {
                currentQualityLS = localStorage.getItem(lsKeyQuality);
                currentMutedLS = localStorage.getItem(lsKeyMuted);
                currentVolumeLS = localStorage.getItem(lsKeyVolume);
                if (localStorageHookFailed && player?.core?.state) {
                    localStorage.setItem(lsKeyMuted, JSON.stringify({default:player.core.state.muted}));
                    localStorage.setItem(lsKeyVolume, player.core.state.volume);
                }
                if (localStorageHookFailed && player?.core?.state?.quality?.group) {
                    localStorage.setItem(lsKeyQuality, JSON.stringify({default:player.core.state.quality.group}));
                }
            } catch {}
            console.log('Reloading Twitch player');
            playerState.setSrc({ isNewMediaPlayerInstance: true, refreshAccessToken: true });
            postTwitchWorkerMessage('TriggeredPlayerReload');
            player.play();
            if (localStorageHookFailed && (currentQualityLS || currentMutedLS || currentVolumeLS)) {
                setTimeout(() => {
                    try {
                        if (currentQualityLS) {
                            localStorage.setItem(lsKeyQuality, currentQualityLS);
                        }
                        if (currentMutedLS) {
                            localStorage.setItem(lsKeyMuted, currentMutedLS);
                        }
                        if (currentVolumeLS) {
                            localStorage.setItem(lsKeyVolume, currentVolumeLS);
                        }
                    } catch {}
                }, 3000);
            }
            return;
        }
    }
    window.reloadTwitchPlayer = () => {
        doTwitchPlayerTask(false, true);
    };
    function postTwitchWorkerMessage(key, value) {
        twitchWorkers.forEach((worker) => {
            worker.postMessage({key: key, value: value});
        });
    }
    async function handleWorkerFetchRequest(fetchRequest) {
        try {
            const response = await window.realFetch(fetchRequest.url, fetchRequest.options);
            const responseBody = await response.text();
            const responseObject = {
                id: fetchRequest.id,
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: responseBody
            };
            return responseObject;
        } catch (error) {
            return {
                id: fetchRequest.id,
                error: error.message
            };
        }
    }
    function hookFetch() {
        const realFetch = window.fetch;
        window.realFetch = realFetch;
        const AD_HOSTS = [
            'amazon-adsystem.com',
            'doubleclick.net',
            'googlesyndication.com',
            'imasdk.googleapis.com',
            'twitchads.com',
            'ads.twitch.tv'
        ];
        window.fetch = function(url, init, ...args) {
            if (typeof url === 'string') {
                if (AD_HOSTS.some(host => url.includes(host))) {
                    // A 204 cannot carry a body: `new Response('', {status: 204})`
                    // throws, so every blocked ad request used to surface as an
                    // exception in Twitch code instead of an empty response.
                    return Promise.resolve(new Response(null, { status: 204 }));
                }
                if (url.includes('gql') && init && init.headers) {
                    const readHeader = function(name) {
                        const headers = init.headers;
                        if (!headers) {
                            return undefined;
                        }
                        if (typeof headers.get === 'function') {
                            return headers.get(name) || undefined;
                        }
                        return headers[name] || headers[name.toLowerCase()] || undefined;
                    };
                    const deviceId = readHeader('X-Device-Id') || readHeader('Device-ID');
                    if (typeof deviceId === 'string' && GQLDeviceID != deviceId) {
                        GQLDeviceID = deviceId;
                        postTwitchWorkerMessage('UpdateDeviceId', GQLDeviceID);
                    }
                    const clientVersion = readHeader('Client-Version');
                    if (typeof clientVersion === 'string' && clientVersion !== ClientVersion) {
                        postTwitchWorkerMessage('UpdateClientVersion', ClientVersion = clientVersion);
                    }
                    const clientSession = readHeader('Client-Session-Id');
                    if (typeof clientSession === 'string' && clientSession !== ClientSession) {
                        postTwitchWorkerMessage('UpdateClientSession', ClientSession = clientSession);
                    }
                    const clientIntegrity = readHeader('Client-Integrity');
                    if (typeof clientIntegrity === 'string' && clientIntegrity !== ClientIntegrityHeader) {
                        postTwitchWorkerMessage('UpdateClientIntegrityHeader', ClientIntegrityHeader = clientIntegrity);
                    }
                    const authorization = readHeader('Authorization');
                    if (typeof authorization === 'string' && authorization !== AuthorizationHeader) {
                        postTwitchWorkerMessage('UpdateAuthorizationHeader', AuthorizationHeader = authorization);
                    }
                    // The player-type rewrite below also covers picture-by-picture.
                    // Never send an empty body: gql answers 400 and Twitch retries it,
                    // which is what stalls the player on first load.
                    if (ForceAccessTokenPlayerType && typeof init.body === 'string' && init.body.includes('PlaybackAccessToken')) {
                        try {
                            const newBody = JSON.parse(init.body);
                            const targets = Array.isArray(newBody) ? newBody : [newBody];
                            let replacedPlayerType = '';
                            for (const target of targets) {
                                const variables = target && target.variables;
                                if (variables && variables.playerType && variables.playerType !== ForceAccessTokenPlayerType) {
                                    replacedPlayerType = variables.playerType;
                                    variables.playerType = ForceAccessTokenPlayerType;
                                }
                            }
                            if (replacedPlayerType) {
                                console.log(`Replaced '${replacedPlayerType}' player type with '${ForceAccessTokenPlayerType}' player type`);
                                init.body = JSON.stringify(newBody);
                            }
                        } catch (err) {
                            // A body we cannot parse is forwarded untouched, never dropped.
                            console.log('TwitchAdv: gql body rewrite skipped (' + err + ')');
                        }
                    }
                }
            }
            return realFetch.apply(this, arguments);
        };
    }
    function onContentLoaded() {
        // This stops Twitch from pausing the player when in another tab and an ad shows.
        // Taken from https://github.com/saucettv/VideoAdBlockForTwitch/blob/cefce9d2b565769c77e3666ac8234c3acfe20d83/chrome/content.js#L30
        try {
            Object.defineProperty(document, 'visibilityState', {
                get() {
                    return 'visible';
                }
            });
        }catch{}
        let hidden = document.__lookupGetter__('hidden');
        let webkitHidden = document.__lookupGetter__('webkitHidden');
        try {
            Object.defineProperty(document, 'hidden', {
                get() {
                    return false;
                }
            });
        }catch{}
        const block = e => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        };
        let wasVideoPlaying = true;
        const visibilityChange = e => {
            const isChrome = typeof chrome !== 'undefined';
            const videos = document.getElementsByTagName('video');
            if (videos.length > 0) {
                if (hidden.apply(document) === true || (webkitHidden && webkitHidden.apply(document) === true)) {
                    wasVideoPlaying = !videos[0].paused && !videos[0].ended;
                } else {
                    if (!playerBufferState.hasStreamStarted) {
                        //console.log('Tab focused. Stream should be active');
                        playerBufferState.hasStreamStarted = true;
                    }
                    if (isChrome && wasVideoPlaying && !videos[0].ended && videos[0].paused && videos[0].muted) {
                        videos[0].play();
                    }
                }
            }
            block(e);
        };
        document.addEventListener('visibilitychange', visibilityChange, true);
        document.addEventListener('webkitvisibilitychange', visibilityChange, true);
        document.addEventListener('mozvisibilitychange', visibilityChange, true);
        document.addEventListener('hasFocus', block, true);
        try {
            if (/Firefox/.test(navigator.userAgent)) {
                Object.defineProperty(document, 'mozHidden', {
                    get() {
                        return false;
                    }
                });
            } else {
                Object.defineProperty(document, 'webkitHidden', {
                    get() {
                        return false;
                    }
                });
            }
        }catch{}
        // Hooks for preserving volume / resolution
        try {
            const keysToCache = [
                'video-quality',
                'video-muted',
                'volume',
                'lowLatencyModeEnabled',// Low Latency
                'persistenceEnabled',// Mini Player
            ];
            const cachedValues = new Map();
            for (let i = 0; i < keysToCache.length; i++) {
                cachedValues.set(keysToCache[i], localStorage.getItem(keysToCache[i]));
            }
            const realSetItem = localStorage.setItem;
            localStorage.setItem = function(key, value) {
                if (cachedValues.has(key)) {
                    cachedValues.set(key, value);
                }
                realSetItem.apply(this, arguments);
            };
            const realGetItem = localStorage.getItem;
            localStorage.getItem = function(key) {
                if (cachedValues.has(key)) {
                    return cachedValues.get(key);
                }
                return realGetItem.apply(this, arguments);
            };
            if (!localStorage.getItem.toString().includes(Object.keys({cachedValues})[0])) {
                // These hooks are useful to preserve player state on player reload
                // Firefox doesn't allow hooking of localStorage functions but chrome does
                localStorageHookFailed = true;
            }
        } catch (err) {
            console.log('localStorageHooks failed ' + err)
            localStorageHookFailed = true;
        }
    }
    declareOptions(window);
    hookWindowWorker();
    hookFetch();
    if (PlayerBufferingFix) {
        monitorPlayerBuffering();
    }
    if (document.readyState === "complete" || document.readyState === "loaded" || document.readyState === "interactive") {
        onContentLoaded();
    } else {
        window.addEventListener("DOMContentLoaded", function() {
            onContentLoaded();
        });
    }
    window.simulateAds = (depth) => {
        if (depth === undefined || depth < 0) {
            console.log('Ad depth paramter required (0 = no simulated ad, 1+ = use backup player for given depth)');
            return;
        }
        postTwitchWorkerMessage('SimulateAds', depth);
    };
    window.allSegmentsAreAdSegments = () => {
        postTwitchWorkerMessage('AllSegmentsAreAdSegments');
    };
})();

