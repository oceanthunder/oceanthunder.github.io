(() => {
	"use strict";

	const REPO = "oceanthunder/oceanthunder.github.io";
	const API = `https://api.github.com/repos/${REPO}/commits?per_page=1`;

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

	async function updateStats() {
		try {
			const response = await fetch(API, {
				cache: "no-store",
				headers: { Accept: "application/vnd.github+json" }
			});

			if (!response.ok) {
				return;
			}

			const commits = await response.json();
			const latest = Array.isArray(commits) ? commits[0] : null;
			if (!latest) {
				return;
			}

			const commitInfo = latest.commit || {};
			const updated = formatDate(
				(commitInfo.committer && commitInfo.committer.date) ||
					(commitInfo.author && commitInfo.author.date)
			);
			const count = getCommitCount(response.headers.get("Link"), commits);

			if (updated) {
				setText(updatedEl, updated);
			}

			if (count) {
				setText(commitsEl, String(count));
			}
		} catch (error) {
			// Keep the fallback values already in the HTML.
		}
	}

	updateStats();
})();
