(() => {
	"use strict";

	const USER = "oceanthunder";
	const USER_PATH = encodeURIComponent(USER);
	const PROFILE = `https://listenbrainz.org/user/${USER_PATH}/`;
	const API = `https://api.listenbrainz.org/1/user/${USER_PATH}`;
	const POLL_INTERVAL = 30000;
	const REQUEST_TIMEOUT = 10000;

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

	const artCache = new Map();
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

	function timeAgo(unixSeconds) {
		if (!unixSeconds) {
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

	function simplifyTrack(name) {
		return name
			.replace(/\s*[([][^)\]]*[)\]]/g, "")
			.replace(/\s+-\s+.*$/, "")
			.trim();
	}

	function searchTerm(parts) {
		return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
	}

	async function findArtwork(artist, track, release) {
		const key = [artist, track, release].join("|").toLowerCase();
		if (artCache.has(key)) {
			return artCache.get(key);
		}

		const simplified = simplifyTrack(track);
		const queries = [
			searchTerm([artist, track, release]),
			searchTerm([artist, track]),
			simplified !== track ? searchTerm([artist, simplified]) : "",
			searchTerm([artist, release])
		].filter((query, index, all) => query && all.indexOf(query) === index);

		for (const term of queries) {
			try {
				const data = await getJSON(
					`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=5`
				);
				const results = Array.isArray(data.results) ? data.results : [];
				const hit = results.find((item) => item && item.artworkUrl100);

				if (hit) {
					const url = hit.artworkUrl100.replace(/\/\d+x\d+bb\./, "/300x300bb.");
					artCache.set(key, url);
					return url;
				}
			} catch (error) {
				// Try the next, less specific search.
			}
		}

		artCache.set(key, "");
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

	function renderListen(listen, isPlaying) {
		const metadata = listen.track_metadata || {};
		const artist = metadata.artist_name || "Unknown artist";
		const track = metadata.track_name || "Unknown track";
		const release = metadata.release_name || "";
		const key = [isPlaying, artist, track, release, isPlaying ? "" : listen.listened_at].join("|");

		hasContent = true;
		root.classList.toggle("is-playing", isPlaying);
		setText(el.when, isPlaying ? "live" : timeAgo(listen.listened_at));

		if (key === currentKey) {
			return;
		}

		currentKey = key;
		setText(el.status, isPlaying ? "Now playing" : "Last played");
		setText(el.track, track);
		setText(el.artist, release ? `${artist} \u2014 ${release}` : artist);

		el.track.title = track;
		el.artist.title = release ? `${artist} \u2014 ${release}` : artist;

		const token = ++artRequest;
		const alt = `${release || track} album art`;

		findArtwork(artist, track, release).then((url) => {
			if (token !== artRequest) {
				return;
			}

			if (url) {
				loadArtwork(url, alt, token);
			} else {
				el.art.hidden = true;
			}
		});
	}

	function renderEmpty() {
		hasContent = true;
		currentKey = "empty";
		artRequest += 1;
		root.classList.remove("is-playing");
		el.art.hidden = true;

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

	function firstListen(payload) {
		return payload && payload.listens && payload.listens[0] ? payload.listens[0] : null;
	}

	async function refresh() {
		try {
			const now = await getJSON(`${API}/playing-now`);
			const nowPlaying = firstListen(now.payload);

			if (nowPlaying) {
				renderListen(nowPlaying, true);
				return;
			}

			const recent = await getJSON(`${API}/listens?count=1`);
			const lastPlayed = firstListen(recent.payload);

			if (lastPlayed) {
				renderListen(lastPlayed, false);
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

	// Keep the profile link in sync if the username is ever changed above.
	document.querySelectorAll("#now-playing a").forEach((link) => {
		link.href = PROFILE;
	});

	tick();
})();
