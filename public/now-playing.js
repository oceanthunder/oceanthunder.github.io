(() => {
	"use strict";

	const USER = "ocean_thunder";
	const PROFILE = `https://www.last.fm/user/${encodeURIComponent(USER)}/`;
	const API = "https://ws.audioscrobbler.com/2.0/";
	// Public, read-only API key. The Last.fm shared secret is never used here.
	const API_KEY = "0046f14e0bf5744a5557b78a95185e5e";
	const POLL_INTERVAL = 30000;
	const REQUEST_TIMEOUT = 10000;
	const PLACEHOLDER_ART = "2a96cbd8b46e442fc41c2b86b821562f";

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

	function apiUrl(method, params) {
		const url = new URL(API);
		url.searchParams.set("method", method);
		url.searchParams.set("api_key", API_KEY);
		url.searchParams.set("format", "json");

		Object.keys(params).forEach((key) => {
			url.searchParams.set(key, params[key]);
		});

		// Avoid any intermediary cache returning an old "now playing" result.
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

	function firstTrack(payload) {
		const tracks = payload && payload.recenttracks && payload.recenttracks.track;
		if (!tracks) {
			return null;
		}

		return Array.isArray(tracks) ? tracks[0] || null : tracks;
	}

	function isNowPlaying(track) {
		return Boolean(
			track &&
				track["@attr"] &&
				track["@attr"].nowplaying === "true"
		);
	}

	function pickArtwork(track) {
		const images = Array.isArray(track && track.image) ? track.image : [];
		const sizes = ["mega", "extralarge", "large", "medium", "small"];

		for (const size of sizes) {
			const image = images.find(
				(item) => item && item.size === size && item["#text"]
			);

			if (image && !image["#text"].includes(PLACEHOLDER_ART)) {
				return image["#text"];
			}
		}

		return "";
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

	function renderTrack(track, isPlaying) {
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
		const artwork = pickArtwork(track);

		// Hide the previous cover while the new one loads.
		el.art.hidden = true;

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
		setText(el.artist, "Check my profile on Last.fm");
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
			const payload = await getJSON(
				apiUrl("user.getrecenttracks", {
					user: USER,
					limit: "1"
				})
			);

			if (payload && payload.error) {
				throw new Error(payload.message || `Last.fm error ${payload.error}`);
			}

			const track = firstTrack(payload);

			if (track) {
				renderTrack(track, isNowPlaying(track));
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
			timerId = setTimeout(tick, POLL_INTERVAL);
		}
	}

	document.addEventListener("visibilitychange", () => {
		clearTimeout(timerId);
		timerId = null;

		if (!document.hidden) {
			tick();
		}
	});

	// Keep the profile links in sync if the username is ever changed above.
	document.querySelectorAll("#now-playing a").forEach((link) => {
		if (!link.classList.contains("np-track") && !link.classList.contains("np-art")) {
			link.href = PROFILE;
		}
	});

	tick();
})();
