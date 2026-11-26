(() => {
	"use strict";

	const USER = "oceanthunder";
	const PROFILE = `https://listenbrainz.org/user/${encodeURIComponent(USER)}/`;
	const API = "https://api.listenbrainz.org/1/";
	const ART_API = "https://itunes.apple.com/search";
	const POLL_INTERVAL = 30000;
	const LIVE_POLL_INTERVAL = 5000;
	const REQUEST_TIMEOUT = 10000;
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
		const release = mapping.caa_release_mbid;
		const artwork =
			release && mapping.caa_id
				? `https://archive.org/download/mbid-${release}/mbid-${release}-${mapping.caa_id}_thumb500.jpg`
				: "";

		return {
			artist: meta.artist_name || "",
			name: meta.track_name || "",
			album: meta.release_name || "",
			url: PROFILE,
			date: {
				uts: listen && listen.listened_at ? String(listen.listened_at) : ""
			},
			artwork: artwork,
			"@attr": { nowplaying: isPlaying ? "true" : "false" }
		};
	}

	function normalize(value) {
		return String(value || "")
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/\([^)]*\)|\[[^\]]*\]/g, "")
			.replace(/[^a-z0-9]+/g, " ")
			.trim();
	}

	async function pickArtwork(track, token) {
		if (!track) {
			return "";
		}

		if (track.artwork) {
			return token === artRequest ? track.artwork : "";
		}

		const artist = normalize(text(track.artist));
		const name = normalize(text(track.name));

		if (!artist || !name) {
			return "";
		}

		const key = `${artist}|${name}`;
		if (artCache.has(key)) {
			return artCache.get(key);
		}

		const url = new URL(ART_API);
		url.searchParams.set("term", `${artist} ${name}`);
		url.searchParams.set("entity", "song");
		url.searchParams.set("limit", "5");

		try {
			const payload = await getJSON(url.toString());
			const results = Array.isArray(payload && payload.results)
				? payload.results
				: [];
			const album = normalize(text(track.album));
			let best = null;
			let bestScore = 0;

			results.forEach((item) => {
				const itemArtist = normalize(item.artistName);
				const itemName = normalize(item.trackName);
				const itemAlbum = normalize(item.collectionName);
				let score = 0;

				if (
					itemArtist &&
					(itemArtist === artist ||
						artist.includes(itemArtist) ||
						itemArtist.includes(artist))
				) {
					score += 3;
				}

				if (
					itemName &&
					(itemName === name ||
						name.includes(itemName) ||
						itemName.includes(name))
				) {
					score += 3;
				}

				if (album && itemAlbum === album) {
					score += 1;
				}

				if (item.artworkUrl100) {
					score += 1;
				}

				if (score > bestScore) {
					bestScore = score;
					best = item;
				}
			});

			const artwork =
				best && bestScore >= 7 && best.artworkUrl100
					? best.artworkUrl100.replace(
							/100x100bb\.(jpg|png)$/i,
							"600x600bb.$1"
						)
					: "";

			artCache.set(key, artwork);
			return token === artRequest ? artwork : "";
		} catch (error) {
			return "";
		}
	}

	function loadArtwork(url, alt, token) {
		if (!url || token !== artRequest) {
			return;
		}

		const loader = new Image();

		loader.onload = () => {
			if (token !== artRequest) {
				return;
			}

			el.art.src = url;
			el.art.alt = alt;
			el.art.hidden = false;
		};

		loader.onerror = () => {
			if (token === artRequest) {
				el.art.hidden = true;
			}
		};

		loader.src = url;
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

		el.art.hidden = true;

		const artwork = await pickArtwork(track, token);

		if (token !== artRequest) {
			return;
		}

		if (artwork) {
			loadArtwork(artwork, `${album || name} album art`, token);
		} else {
			el.art.hidden = true;
		}
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
