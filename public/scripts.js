const POSTER_PATH = "assets/posters/";
const POSTER_MANIFEST = "assets/posters/posters.json";
const POSTER_EXTENSIONS = /\.(jpe?g|png|webp|avif)$/i;
const POSTER_INTERVAL = 6969;

let posterTimer = null;
let posterChangeToken = 0;
let posters = [];
let currentIndex = -1;
let frontLayer = null;
let backLayer = null;

function titleFromFile(name) {
	return String(name)
		.replace(/\.[^.]+$/, "")
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase())
		.trim();
}

function normalizePosters(data) {
	if (!Array.isArray(data)) return [];

	return data
		.map((item) => {
			if (typeof item === "string") {
				return {
					src: item.startsWith("assets/") ? item : POSTER_PATH + item,
					title: titleFromFile(item)
				};
			}

			if (item && typeof item.src === "string" && item.src) {
				return {
					src: item.src.startsWith("assets/") ? item.src : POSTER_PATH + item.src,
					title: item.title || titleFromFile(item.src)
				};
			}

			return null;
		})
		.filter(Boolean);
}

async function loadPostersFromListing() {
	try {
		const response = await fetch(`${POSTER_PATH}?v=${Date.now()}`, { cache: "no-store" });
		if (!response.ok) return [];

		const html = await response.text();
		const listing = new DOMParser().parseFromString(html, "text/html");
		const files = [...listing.querySelectorAll("a[href]")]
			.map((link) => link.getAttribute("href"))
			.filter((href) => href && !href.includes("/") && POSTER_EXTENSIONS.test(href))
			.map((href) => decodeURIComponent(href));

		return files.map((file) => ({
			src: POSTER_PATH + file,
			title: titleFromFile(file)
		}));
	} catch (error) {
		return [];
	}
}

async function loadPosters() {
	try {
		const response = await fetch(`${POSTER_MANIFEST}?v=${Date.now()}`, { cache: "no-store" });
		if (response.ok) {
			const fromManifest = normalizePosters(await response.json());
			if (fromManifest.length) return fromManifest;
		}
	} catch (error) {
	}

	return loadPostersFromListing();
}

function createLayer(container) {
	const img = document.createElement("img");
	img.className = "poster-layer";
	img.alt = "";
	img.decoding = "async";
	img.draggable = false;
	container.appendChild(img);
	return img;
}

function pickNextIndex() {
	if (posters.length <= 1) return 0;

	let index;
	do {
		index = Math.floor(Math.random() * posters.length);
	} while (index === currentIndex);

	return index;
}

function applyPoster(layer, poster) {
	layer.src = poster.src;
	layer.alt = poster.title ? `${poster.title} poster` : "Poster";
}

function showFirstPoster() {
	currentIndex = pickNextIndex();
	applyPoster(frontLayer, posters[currentIndex]);
	frontLayer.classList.add("is-visible");
}

function changePoster() {
	if (!frontLayer || !backLayer || posters.length === 0) return;

	const token = ++posterChangeToken;
	const maxTries = Math.min(posters.length, 6);
	let tries = 0;

	const tryNext = () => {
		if (token !== posterChangeToken) return;
		if (tries >= maxTries) return;
		tries += 1;

		const index = pickNextIndex();
		const poster = posters[index];
		const loader = new Image();
		loader.decoding = "async";

		loader.onload = () => {
			if (token !== posterChangeToken) return;
			currentIndex = index;
			applyPoster(backLayer, poster);

			const reveal = () => {
				if (token !== posterChangeToken) return;
				backLayer.classList.add("is-visible");
				frontLayer.classList.remove("is-visible");
				const previousFront = frontLayer;
				frontLayer = backLayer;
				backLayer = previousFront;
			};

			if (typeof backLayer.decode === "function") {
				backLayer.decode().then(reveal).catch(reveal);
			} else {
				reveal();
			}
		};

		loader.onerror = () => {
			if (token === posterChangeToken) tryNext();
		};

		loader.src = poster.src;
	};

	tryNext();
}

function stopPosterCycle() {
	if (posterTimer !== null) {
		clearInterval(posterTimer);
		posterTimer = null;
	}
}

function startPosterCycle() {
	stopPosterCycle();
	posterTimer = setInterval(changePoster, POSTER_INTERVAL);
}

async function initPosterWidget() {
	const container = document.getElementById("gifs");
	if (!container) return;

	posters = await loadPosters();
	if (!posters.length) return;

	container.innerHTML = "";
	frontLayer = createLayer(container);
	backLayer = createLayer(container);
	showFirstPoster();
	startPosterCycle();

	document.addEventListener("visibilitychange", () => {
		if (document.hidden) {
			stopPosterCycle();
		} else {
			startPosterCycle();
		}
	});
}

document.addEventListener("DOMContentLoaded", () => {
	initPosterWidget();
});
