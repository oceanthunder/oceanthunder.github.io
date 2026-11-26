(() => {
	"use strict";

	const USER = "oceanthunder";
	const PROFILE = `https://listenbrainz.org/user/${encodeURIComponent(USER)}/`;
	const API = "https://api.listenbrainz.org/1/";
	const ITUNES_API = "https://itunes.apple.com/search";
	const SPOTIFY_OEMBED = "https://open.spotify.com/oembed";
	const SOUNDCLOUD_OEMBED = "https://soundcloud.com/oembed";
	const POLL_INTERVAL = 30000;
	const LIVE_POLL_INTERVAL = 5000;
	const REQUEST_TIMEOUT = 10000;
	const MAX_ART_CACHE = 100;
	const artCache = new Map();

	const root = document.getElementById("now-playing");
	if (!root) {
		return;
	}

	const el = {
		art: document.getElementById("np-art-img"),
		status: document.getElementById("np-status"),
		track: document.getElementById("np-track"),
		artist: document.getElementById("np-artist"),
		when: document.getElementById("np-when")
	};

	const artLink = root.querySelector(".np-art");
	let timerId = null;
	let artRequest = 0;
	let currentKey = "";
	let hasContent = false;

	el.art.onerror = () => {
		el.art.hidden = true;
	};

	function setText(node, value) {
		if (node.textContent !== value) {
			node.textContent = value;
		}
	}

	async function getJSON(url) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

		try {
			const response = await fetch(url, {
				cache: "no-store",
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			return await response.json();
		} finally {
			clearTimeout(timeout);
		}
	}

	function apiUrl(path, params) {
		const url = new URL(API + path);

		Object.keys(params).forEach((key) => {
			url.searchParams.set(key, params[key]);
		});

		url.searchParams.set("_", String(Date.now()));
		return url.toString();
	}

	function timeAgo(unixSeconds) {
		if (!unixSeconds || !Number.isFinite(unixSeconds)) {
			return "";
		}

		const seconds = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);

		if (seconds < 60) {
			return "just now";
		}

		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) {
			return `${minutes}m ago`;
		}

		const hours = Math.floor(minutes / 60);
		if (hours < 24) {
			return `${hours}h ago`;
		}

		const days = Math.floor(hours / 24);
		if (days < 30) {
			return `${days}d ago`;
		}

		return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
			day: "numeric",
			month: "short"
		});
	}

	function text(value) {
		if (value && typeof value === "object") {
			return value["#text"] || value.name || "";
		}

		return value || "";
	}

	function firstListen(payload) {
		const listens = payload && payload.payload && payload.payload.listens;
		return Array.isArray(listens) ? listens[0] || null : null;
	}

	function toTrack(listen, isPlaying) {
		const meta = (listen && listen.track_metadata) || {};
		const mapping = meta.mbid_mapping || {};
		const additional = meta.additional_info || {};
		const release = mapping.caa_release_mbid;
		const artwork =
			release && mapping.caa_id
				? `https://archive.org/download/mbid-${release}/mbid-${release}-${mapping.caa_id}_thumb500.jpg`
				: "";
		const sourceUrls = Array.isArray(mapping.url_rels)
			? mapping.url_rels
					.map((rel) => rel && rel.url)
					.filter((url) => typeof url === "string" && url)
			: [];

		return {
			artist: meta.artist_name || "",
			name: meta.track_name || "",
			album: meta.release_name || "",
			url: PROFILE,
			date: {
				uts: listen && listen.listened_at ? String(listen.listened_at) : ""
			},
			artwork: artwork,
			origin: typeof additional.origin_url === "string" ? additional.origin_url : "",
			sourceUrls: sourceUrls,
			releaseMbid: mapping.release_mbid || "",
			releaseGroupMbid: mapping.release_group_mbid || "",
			"@attr": { nowplaying: isPlaying ? "true" : "false" }
		};
	}

	function normalize(value) {
		return String(value || "")
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/\([^)]*\)|\[[^\]]*\]/g, "")
			.replace(/[^\p{L}\p{N}]+/gu, " ")
			.trim();
	}

	function matches(a, b) {
		if (!a || !b) {
			return false;
		}

		if (a === b) {
			return true;
		}

		if (a.length < 4 || b.length < 4) {
			return false;
		}

		return a.includes(b) || b.includes(a);
	}

	function trackSources(track) {
		return [track.origin].concat(
			Array.isArray(track.sourceUrls) ? track.sourceUrls : []
		);
	}

	function oembedSources(track) {
		const sources = trackSources(track);
		const urls = [];
		const seen = new Set();

		sources.forEach((raw) => {
			if (typeof raw !== "string" || !raw) {
				return;
			}

			let parsed;
			try {
				parsed = new URL(raw);
			} catch (error) {
				return;
			}

			if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
				return;
			}

			const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
			let endpoint = "";

			if (host === "spotify.com" || host.endsWith(".spotify.com")) {
				if (/^\/(track|album|episode|show)\//.test(parsed.pathname)) {
					endpoint = `${SPOTIFY_OEMBED}?url=${encodeURIComponent(parsed.toString())}`;
				}
			} else if (host === "soundcloud.com" || host.endsWith(".soundcloud.com")) {
				if (parsed.pathname && parsed.pathname !== "/") {
					endpoint = `${SOUNDCLOUD_OEMBED}?format=json&url=${encodeURIComponent(parsed.toString())}`;
				}
			}

			if (endpoint && !seen.has(endpoint)) {
				seen.add(endpoint);
				urls.push(endpoint);
			}
		});

		return urls;
	}

	function enlargeSpotifyArt(url) {
		return url.replace(
			/\/image\/ab67616d00001e02([0-9a-f]+)/i,
			"/image/ab67616d0000b273$1"
		);
	}

	function youtubeThumbnail(track) {
		const sources = trackSources(track);

		for (let i = 0; i < sources.length; i += 1) {
			const raw = sources[i];
			if (typeof raw !== "string" || !raw) {
				continue;
			}

			let parsed;
			try {
				parsed = new URL(raw);
			} catch (error) {
				continue;
			}

			const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
			let id = "";

			if (host === "youtu.be") {
				id = parsed.pathname.slice(1);
			} else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
				if (parsed.pathname === "/watch") {
					id = parsed.searchParams.get("v") || "";
				} else {
					const parts = parsed.pathname.split("/");
					if (
						(parts[1] === "embed" ||
							parts[1] === "shorts" ||
							parts[1] === "live") &&
						parts[2]
					) {
						id = parts[2];
					}
				}
			}

			if (/^[A-Za-z0-9_-]{11}$/.test(id)) {
				return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
			}
		}

		return "";
	}

	async function searchItunesArt(query, track) {
		const url = new URL(ITUNES_API);
		url.searchParams.set("term", query.term);
		url.searchParams.set("entity", query.entity);
		url.searchParams.set("limit", "5");

		try {
			const payload = await getJSON(url.toString());
			const results = Array.isArray(payload && payload.results)
				? payload.results
				: [];
			const artist = normalize(text(track.artist));
			const name = normalize(text(track.name));
			const album = normalize(text(track.album));
			const albumSearch = query.entity === "album";
			let strict = null;
			let strictScore = 0;
			let loose = null;
			let looseScore = 0;

			results.forEach((item) => {
				if (!item || !item.artworkUrl100) {
					return;
				}

				const itemArtist = normalize(item.artistName);
				const itemName = normalize(
					albumSearch ? item.collectionName : item.trackName
				);
				const itemAlbum = normalize(item.collectionName);
				let score = 1;

				if (matches(itemArtist, artist)) {
					score += 3;
				}

				if (matches(itemName, name)) {
					score += 3;
				}

				if (album && itemAlbum === album) {
					score += 1;
				}

				if (score > strictScore) {
					strictScore = score;
					strict = item;
				}

				if (
					artist &&
					album &&
					matches(itemArtist, artist) &&
					itemAlbum === album &&
					score > looseScore
				) {
					looseScore = score;
					loose = item;
				}
			});

			const best =
				strictScore >= 7 ? strict : looseScore >= 5 ? loose : null;

			return best
				? best.artworkUrl100.replace(
						/100x100bb\.(jpg|png)$/i,
						"600x600bb.$1"
					)
				: "";
		} catch (error) {
			return "";
		}
	}

	async function* artworkCandidates(track, token) {
		const seen = new Set();
		const unique = (url) => {
			if (!url || typeof url !== "string" || seen.has(url)) {
				return false;
			}

			seen.add(url);
			return true;
		};

		const direct = [track.artwork];

		if (track.releaseMbid) {
			direct.push(
				`https://coverartarchive.org/release/${encodeURIComponent(track.releaseMbid)}/front-500`
			);
		}

		if (track.releaseGroupMbid) {
			direct.push(
				`https://coverartarchive.org/release-group/${encodeURIComponent(track.releaseGroupMbid)}/front-500`
			);
		}

		for (const url of direct) {
			if (token !== artRequest) {
				return;
			}

			if (unique(url)) {
				yield url;
			}
		}

		for (const source of oembedSources(track)) {
			if (token !== artRequest) {
				return;
			}

			let payload = null;
			try {
				payload = await getJSON(source);
			} catch (error) {
				continue;
			}

			if (token !== artRequest) {
				return;
			}

			const thumbnail = payload && payload.thumbnail_url;
			if (typeof thumbnail !== "string" || !/^https:\/\//i.test(thumbnail)) {
				continue;
			}

			const large = enlargeSpotifyArt(thumbnail);
			if (large !== thumbnail && unique(large)) {
				yield large;
			}

			if (unique(thumbnail)) {
				yield thumbnail;
			}
		}

		const artist = text(track.artist);
		const name = text(track.name);
		const album = text(track.album);

		if (normalize(artist) && normalize(name)) {
			const queries = [
				{ term: `${artist} ${name}`, entity: "song" }
			];

			if (album && normalize(album) !== normalize(name)) {
				queries.push({ term: `${artist} ${album}`, entity: "album" });
			}

			for (const query of queries) {
				if (token !== artRequest) {
					return;
				}

				const artwork = await searchItunesArt(query, track);
				if (token !== artRequest) {
					return;
				}

				if (artwork && unique(artwork)) {
					yield artwork;
				}
			}
		}

		if (token !== artRequest) {
			return;
		}

		const youtube = youtubeThumbnail(track);
		if (youtube && unique(youtube)) {
			yield youtube;
		}
	}

	function canLoad(url, token) {
		return new Promise((resolve) => {
			let timer = null;
			let settled = false;

			const done = (value) => {
				if (settled) {
					return;
				}

				settled = true;
				if (timer !== null) {
					clearTimeout(timer);
				}

				resolve(value);
			};

			const loader = new Image();
			loader.onload = () => done(token === artRequest);
			loader.onerror = () => done(false);
			timer = setTimeout(() => done(false), REQUEST_TIMEOUT);
			loader.src = url;
		});
	}

	async function resolveArtwork(track, token) {
		for await (const url of artworkCandidates(track, token)) {
			if (token !== artRequest) {
				return "";
			}

			if (await canLoad(url, token)) {
				return url;
			}
		}

		return "";
	}

	function cacheArtwork(key, url) {
		if (artCache.size >= MAX_ART_CACHE) {
			artCache.delete(artCache.keys().next().value);
		}

		artCache.set(key, url);
	}

	function showArtwork(url, alt, token) {
		if (!url || token !== artRequest) {
			return;
		}

		el.art.src = url;
		el.art.alt = alt;
		el.art.hidden = false;
	}

	function setLinks(track) {
		const url = track && track.url ? track.url : PROFILE;
		el.track.href = url;

		if (artLink) {
			artLink.href = url;
		}
	}

	async function renderTrack(track, isPlaying) {
		const artist = text(track.artist) || "Unknown artist";
		const name = text(track.name) || "Unknown track";
		const album = text(track.album) || "";
		const timestamp =
			track.date && track.date.uts ? Number(track.date.uts) : null;
		const key = [
			isPlaying,
			artist,
			name,
			album,
			isPlaying ? "" : timestamp
		].join("|");

		hasContent = true;
		root.classList.toggle("is-playing", isPlaying);
		setText(el.when, isPlaying ? "live" : timeAgo(timestamp));
		setLinks(track);

		if (key === currentKey) {
			return;
		}

		currentKey = key;
		setText(el.status, isPlaying ? "Now playing" : "Last played");
		setText(el.track, name);
		setText(el.artist, album ? `${artist} \u2014 ${album}` : artist);

		el.track.title = name;
		el.artist.title = album ? `${artist} \u2014 ${album}` : artist;

		const token = ++artRequest;
		const cacheKey = [normalize(artist), normalize(name), normalize(album)].join(
			"|"
		);

		el.art.hidden = true;

		let artwork;

		if (artCache.has(cacheKey)) {
			artwork = artCache.get(cacheKey);
		} else {
			artwork = await resolveArtwork(track, token);
			cacheArtwork(cacheKey, artwork);
		}

		showArtwork(artwork, `${album || name} album art`, token);
	}

	function renderEmpty() {
		hasContent = true;
		currentKey = "empty";
		artRequest += 1;
		root.classList.remove("is-playing");
		el.art.hidden = true;
		setLinks(null);

		setText(el.status, "Off air");
		setText(el.track, "Nothing playing right now");
		setText(el.artist, "Check my profile on ListenBrainz");
		setText(el.when, "");

		el.track.title = "";
		el.artist.title = "";
	}

	function renderError() {
		if (hasContent) {
			return;
		}

		renderEmpty();
		setText(el.status, "Off air");
		setText(el.track, "Couldn't load what I'm playing");
		setText(el.artist, "Check my profile instead");
	}

	async function refresh() {
		try {
			const user = `user/${encodeURIComponent(USER)}`;
			const [playingPayload, listensPayload] = await Promise.all([
				getJSON(apiUrl(`${user}/playing-now`, {})),
				getJSON(apiUrl(`${user}/listens`, { limit: "1" }))
			]);

			[playingPayload, listensPayload].forEach((payload) => {
				if (payload && payload.error) {
					throw new Error(
						payload.error || `ListenBrainz error ${payload.code}`
					);
				}
			});

			const playing = firstListen(playingPayload);
			const recent = firstListen(listensPayload);
			const listen = playing || recent;

			if (listen) {
				const track = toTrack(listen, Boolean(playing));
				await renderTrack(track, Boolean(playing));
			} else {
				renderEmpty();
			}
		} catch (error) {
			renderError();
		}
	}

	async function tick() {
		await refresh();

		if (!document.hidden) {
			clearTimeout(timerId);
			const interval = root.classList.contains("is-playing")
				? LIVE_POLL_INTERVAL
				: POLL_INTERVAL;
			timerId = setTimeout(tick, interval);
		}
	}

	document.addEventListener("visibilitychange", () => {
		clearTimeout(timerId);
		timerId = null;

		if (!document.hidden) {
			tick();
		}
	});

	document.querySelectorAll("#now-playing a").forEach((link) => {
		if (!link.classList.contains("np-track") && !link.classList.contains("np-art")) {
			link.href = PROFILE;
		}
	});

	tick();
})();
