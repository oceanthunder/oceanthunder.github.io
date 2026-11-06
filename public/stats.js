(() => {
	"use strict";

	const REPO = "oceanthunder/oceanthunder.github.io";
	const GITHUB_API = `https://api.github.com/repos/${REPO}/commits?per_page=1`;
	const LOCAL_STATS = "stats.json";
	const LOADING = "...";
	const UNAVAILABLE = "--";

	const updatedEl = document.getElementById("stat-updated");
	const commitsEl = document.getElementById("stat-commits");

	if (!updatedEl || !commitsEl) {
		return;
	}

	function setText(node, value) {
		if (node.textContent !== value) {
			node.textContent = value;
		}
	}

	function showLoading() {
		setText(updatedEl, LOADING);
		setText(commitsEl, LOADING);
	}

	function showUnavailable() {
		setText(updatedEl, UNAVAILABLE);
		setText(commitsEl, UNAVAILABLE);
	}

	function formatDate(isoDate) {
		const date = new Date(isoDate);
		if (Number.isNaN(date.getTime())) {
			return null;
		}

		return [
			String(date.getDate()).padStart(2, "0"),
			String(date.getMonth() + 1).padStart(2, "0"),
			date.getFullYear()
		].join("/");
	}

	function getCommitCount(linkHeader, commits) {
		if (linkHeader) {
			const lastPage = linkHeader
				.split(",")
				.map((part) => part.trim())
				.find((part) => part.endsWith('rel="last"'));

			const match = lastPage && lastPage.match(/[?&]page=(\d+)/);
			if (match) {
				return Number(match[1]);
			}
		}

		return Array.isArray(commits) ? commits.length : null;
	}

	function render(stats) {
		if (!stats) {
			return false;
		}

		const updated = stats.updated || formatDate(stats.updated_at);
		const commits = stats.commits;
		let rendered = false;

		if (updated) {
			setText(updatedEl, updated);
			rendered = true;
		}

		if (commits) {
			setText(commitsEl, String(commits));
			rendered = true;
		}

		return rendered;
	}

	async function fetchLocalStats() {
		const response = await fetch(`${LOCAL_STATS}?t=${Date.now()}`, {
			cache: "no-store"
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		return await response.json();
	}

	async function fetchGitHubStats() {
		const response = await fetch(GITHUB_API, {
			cache: "no-store",
			headers: { Accept: "application/vnd.github+json" }
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const commits = await response.json();
		const latest = Array.isArray(commits) ? commits[0] : null;
		if (!latest) {
			throw new Error("No commits returned");
		}

		const info = latest.commit || {};

		return {
			updated: formatDate(
				(info.committer && info.committer.date) ||
					(info.author && info.author.date)
			),
			commits: getCommitCount(response.headers.get("Link"), commits)
		};
	}

	async function init() {
		showLoading();

		try {
			const localStats = await fetchLocalStats();
			if (!render(localStats)) {
				throw new Error("Invalid local stats");
			}
			return;
		} catch (localError) {
			// Local stats are generated at deploy time. Fall back to GitHub for
			// local previews or if the file is missing.
		}

		try {
			const remoteStats = await fetchGitHubStats();
			if (!render(remoteStats)) {
				throw new Error("Invalid GitHub stats");
			}
		} catch (error) {
			showUnavailable();
		}
	}

	init();
})();
