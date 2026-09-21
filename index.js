require("dotenv").config();
const Mustache = require("mustache");
const fs = require("fs");
const { Octokit } = require("@octokit/rest");

const token = process.env.GH_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
const username = process.env.GH_USERNAME;

const octokit = new Octokit({
  auth: token,
  userAgent: "aleg-readme v1.0.0",
  baseUrl: "https://api.github.com",
  log: {
    warn: console.warn,
    error: console.error,
  },
});

async function grabDataFromAllRepositories() {
  if (!token) {
    console.warn("⚠️ GH_ACCESS_TOKEN is not set. Generating with placeholder/mock repository statistics.");
    return [];
  }

  try {
    const options = {
      per_page: 100,
    };
    const request = await octokit.rest.repos.listForAuthenticatedUser(options);
    return request.data || [];
  } catch (error) {
    console.error("❌ Failed to fetch repositories:", error.message);
    return [];
  }
}

function calculateTotalStars(data) {
  if (!data || data.length === 0) return 0;
  const stars = data.map((repo) => repo.stargazers_count || 0);
  return stars.reduce((sum, curr) => sum + curr, 0);
}

async function calculateTotalCommits(data, cutoffDate) {
  if (!data || data.length === 0 || !username) return 0;

  const contributorsRequests = [];

  for (const repo of data) {
    const lastRepoUpdate = new Date(repo.updated_at);
    if (!cutoffDate || lastRepoUpdate > cutoffDate) {
      const options = {
        owner: repo.owner ? repo.owner.login : username,
        repo: repo.name,
      };
      contributorsRequests.push(
        octokit.rest.repos
          .getContributorsStats(options)
          .catch((err) => {
            console.warn(`Could not get contributor stats for ${repo.name}: ${err.message}`);
            return { data: [] };
          })
      );
    }
  }

  const totalCommits = await getTotalCommits(contributorsRequests, username, cutoffDate);
  return totalCommits;
}

async function getTotalCommits(requests, contributor, cutoffDate) {
  const repos = await Promise.all(requests);
  let totalCommits = 0;

  repos.forEach((repo) => {
    if (!repo || !Array.isArray(repo.data)) return;

    const contributorStats = repo.data.find(
      (item) => item && item.author && item.author.login && item.author.login.toLowerCase() === contributor.toLowerCase()
    );

    if (contributorStats) {
      totalCommits += !cutoffDate
        ? computeCommitsFromStart(contributorStats)
        : computeCommitsBeforeCutoff(contributorStats, cutoffDate);
    }
  });

  return totalCommits;
}

function computeCommitsFromStart(contributorData) {
  return contributorData.total || 0;
}

function computeCommitsBeforeCutoff(contributorData, cutoffDate) {
  if (!contributorData.weeks) return 0;
  const MILLISECONDS_IN_A_SECOND = 1000;

  const newestWeeks = contributorData.weeks.filter((week) => {
    const milliseconds = week.w * MILLISECONDS_IN_A_SECOND;
    const startOfWeek = new Date(milliseconds);
    return startOfWeek > cutoffDate;
  });

  return newestWeeks.reduce((sum, week) => sum + (week.c || 0), 0);
}

function updateReadme(userData) {
  const TEMPLATE_PATH = "./main.mustache";
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const output = Mustache.render(template, userData);
  fs.writeFileSync("README.md", output, "utf8");
  console.log("✅ README.md successfully updated!");
}

async function main() {
  console.log("⚡ Starting Aleg's profile README build...");

  const repoData = await grabDataFromAllRepositories();
  const totalStars = calculateTotalStars(repoData);

  const lastYear = new Date();
  lastYear.setFullYear(lastYear.getFullYear() - 1);

  const totalCommitsInPastYear = await calculateTotalCommits(repoData, lastYear);

  // Tactical / Agnes Tachyon test tube palette:
  // [Dark Slate, Camo Olive, Lab Teal, Tachyon Amber Glow, Tachyon Orange, Crimson Flash, Potion Cyan, Pure Lab White]
  const colors = [
    "1f2421", // Tactical Slate
    "216869", // Dark Teal
    "49a078", // Lab Green
    "9cc5a1", // Pale Mint
    "f4a261", // Potion Amber
    "e76f51", // Tachyon Orange
    "d90429", // Crimson
    "dce1de", // Lab White
  ];

  updateReadme({
    totalStars,
    totalCommitsInPastYear,
    colors,
  });
}

main().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
